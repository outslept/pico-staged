import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import process from 'node:process'
import type { ExecutorOptions } from './types.ts'

const IS_WINDOWS = process.platform === 'win32'
const RE_META_CHARS = /([()\][%!^"`<>&|;, *?])/g
const RE_CMD_EXT = /\.(?:cmd|bat)$/i

function resolvePathEnvKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
}

function collectNodeModulesBinPaths(cwd: string): string[] {
  const dirs: string[] = []
  let current = resolve(cwd)

  while (true) {
    if (existsSync(join(current, 'node_modules')) || existsSync(join(current, 'package.json'))) {
      dirs.push(join(current, 'node_modules', '.bin'))
    }
    const parent = resolve(current, '..')
    if (parent === current) {
      break
    }
    current = parent
  }

  return dirs
}

function createSpawnEnv(cwd: string, customEnv?: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; pathKey: string } {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...customEnv }
  const pathKey = resolvePathEnvKey(merged)
  const existingParts = (merged[pathKey] ?? '').split(delimiter).filter(Boolean)
  const binDirs = collectNodeModulesBinPaths(cwd)
  const uniquePaths = [...new Set([...binDirs, ...existingParts])]

  merged[pathKey] = uniquePaths.join(delimiter)
  return { env: merged, pathKey }
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) {
      return false
    }
    if (IS_WINDOWS) {
      return true
    }
    const mode = stat.mode
    const uid = process.getuid?.() ?? -1
    const gid = process.getgid?.() ?? -1
    const u = Number.parseInt('100', 8)
    const g = Number.parseInt('010', 8)
    const o = Number.parseInt('001', 8)

    return Boolean(
      mode & o ||
      (mode & g && gid === stat.gid) ||
      (mode & u && uid === stat.uid) ||
      (mode & (u | g) && uid === 0),
    )
  } catch {
    return false
  }
}

function whichExecutable(cmd: string, env: NodeJS.ProcessEnv, pathKey: string): string {
  const pathDirs = (env[pathKey] ?? '').split(delimiter).filter(Boolean)
  const pathExt = IS_WINDOWS ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : ['']

  for (const dir of pathDirs) {
    for (const ext of pathExt) {
      const candidate = join(dir, cmd + ext)
      if (isExecutableFile(candidate)) {
        return candidate
      }
    }
  }

  return cmd
}

function escapeWinCmdMeta(str: string): string {
  return str.replace(RE_META_CHARS, '^$1')
}

function escapeWinCmdArg(arg: string): string {
  let result = `${arg}`
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\*)$/, '$1$1')
  result = `"${result}"`
  return escapeWinCmdMeta(result)
}

function prepareCommand(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  pathKey: string,
  options: SpawnOptions,
): { command: string; commandArgs: string[]; spawnOptions: SpawnOptions } {
  const resolved = whichExecutable(cmd, env, pathKey)

  if (IS_WINDOWS && RE_CMD_EXT.test(resolved)) {
    const shellCmd = [escapeWinCmdMeta(resolved), ...args.map((arg) => escapeWinCmdArg(arg))].join(' ')
    return {
      command: process.env.comspec || 'cmd.exe',
      commandArgs: ['/D', '/S', '/C', `"${shellCmd}"`],
      spawnOptions: { ...options, windowsVerbatimArguments: true },
    }
  }

  return {
    command: resolved,
    commandArgs: args,
    spawnOptions: options,
  }
}

export function executor(cmd: string, args: string[] = [], opts: ExecutorOptions = {}): Promise<string> {
  const cwd = opts.cwd ?? process.cwd()
  const { env, pathKey } = createSpawnEnv(cwd, opts.env)

  const baseOptions: SpawnOptions = {
    cwd,
    env,
    stdio: 'pipe',
    windowsHide: true,
    ...(opts.signal ? { signal: opts.signal } : {}),
  }

  const { command, commandArgs, spawnOptions } = prepareCommand(cmd, args, env, pathKey, baseOptions)

  return new Promise<string>((resolvePromise, rejectPromise) => {
    let output = ''
    const child = spawn(command, commandArgs, spawnOptions)

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    if (opts.input && child.stdin) {
      child.stdin.write(opts.input)
      child.stdin.end()
    }

    child.on('error', (err: Error) => {
      rejectPromise(new Error(output.trim() || err.message))
    })

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolvePromise(output)
      } else {
        rejectPromise(new Error(output || `Process exited with code ${code ?? 1}`))
      }
    })
  })
}
