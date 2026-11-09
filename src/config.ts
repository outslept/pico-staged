import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { PicoStagedConfig, PicoStagedConfigObject, TaskConfigEntry } from './types.ts'

export const CONFIG_PLACES = [
  '.pico-staged.js',
  'pico-staged.js',
  '.pico-staged.mjs',
  'pico-staged.mjs',
  '.pico-staged.cjs',
  'pico-staged.cjs',
  '.pico-staged.json',
  'pico-staged.json',
  '.picostagedrc',
  'package.json',
] as const

const ALLOWED_EXTS = new Set(['.cjs', '.js', '.mjs', '.json', ''])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidTaskEntry(value: unknown): value is TaskConfigEntry {
  if (typeof value === 'function') {
    return true
  }
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (Array.isArray(value) && value.length > 0) {
    return value.every((item) => typeof item === 'string' && item.trim().length > 0)
  }
  return false
}

export function validConfig(config: unknown): config is PicoStagedConfigObject {
  if (!isObject(config)) {
    return false
  }
  const entries = Object.entries(config)
  if (entries.length === 0) {
    return false
  }
  return entries.every(
    ([pattern, cmd]) => typeof pattern === 'string' && pattern.trim().length > 0 && isValidTaskEntry(cmd),
  )
}

function readJson<T = unknown>(filePath: string): T | undefined {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return undefined
  }
}

async function loadConfigFile(filePath: string): Promise<PicoStagedConfigObject | Record<string, never> | undefined> {
  const ext = extname(filePath)
  if (!ALLOWED_EXTS.has(ext)) {
    return {}
  }

  let rawConfig: unknown
  try {
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      const imported = (await import(pathToFileURL(filePath).href)) as { default?: unknown }
      rawConfig = imported.default ?? imported
    } else {
      rawConfig = readJson(filePath)
    }
  } catch {
    return {}
  }

  if (typeof rawConfig === 'function') {
    return { '*': rawConfig as TaskConfigEntry }
  }

  if (isObject(rawConfig)) {
    return rawConfig as PicoStagedConfigObject
  }

  return {}
}

function findConfigCandidate(dir: string): string | undefined {
  for (const place of CONFIG_PLACES) {
    const candidate = resolve(dir, place)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}

export async function getConfig(
  cwd: string = process.cwd(),
  explicitConfig?: string | PicoStagedConfig,
): Promise<PicoStagedConfigObject | Record<string, never> | undefined> {
  if (explicitConfig !== undefined) {
    if (typeof explicitConfig === 'string') {
      return loadConfigFile(resolve(cwd, explicitConfig))
    }
    if (typeof explicitConfig === 'function') {
      return { '*': explicitConfig }
    }
    return explicitConfig
  }

  let currentDir = resolve(cwd)
  while (true) {
    const foundPath = findConfigCandidate(currentDir)
    if (foundPath) {
      if (foundPath.endsWith('package.json')) {
        const pkg = readJson<Record<string, unknown>>(foundPath)
        const pkgConfig = pkg?.['pico-staged']
        if (isObject(pkgConfig)) {
          return pkgConfig as PicoStagedConfigObject
        }
      } else {
        return loadConfigFile(foundPath)
      }
    }

    const parentDir = resolve(currentDir, '..')
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  return undefined
}
