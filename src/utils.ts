import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import tty from 'node:tty'
import { fileURLToPath } from 'node:url'

const ARGV_MATCH_REGEXP = /([^\s'"]([^\s'"]*(['"])([\s\S]*?)\3)+[^\s'"]*)|[^\s'"]+|(['"])([\s\S]*?)\5/gi

export function toArray<T>(val: T | T[] | null | undefined): T[] {
  if (!val) {
    return []
  }
  return Array.isArray(val) ? val : [val]
}

export function stringArgvToArray(str: string): string[] {
  const args: string[] = []
  let match: RegExpExecArray | null

  do {
    match = ARGV_MATCH_REGEXP.exec(str)
    if (match !== null) {
      const value = [match[1], match[6], match[0]].find((item): item is string => typeof item === 'string')
      if (value !== undefined) {
        args.push(value)
      }
    }
  } while (match !== null)

  return args
}

export function getForceColorLevel(): number | false {
  const keys = ['FORCE_COLOR', 'CLICOLOR_FORCE', 'COLORTERM', 'CLICOLOR']
  const env = process.env
  const isTTY = tty.WriteStream.prototype.hasColors()

  if ('NO_COLOR' in env) {
    return false
  }

  for (const key of keys) {
    if (key in env) {
      const value = env[key]
      if (value === 'true' || value === '') {
        return 1
      }
      if (value === 'false') {
        return 0
      }
      const level = Number.parseInt(value ?? '', 10)
      if (!Number.isNaN(level) && level >= 0 && level <= 3) {
        return level
      }
      return isTTY ? 1 : false
    }
  }

  return false
}

export function showVersion(stream: NodeJS.WritableStream = process.stdout): void {
  const candidates = [
    new URL('../package.json', import.meta.url),
    new URL('../../package.json', import.meta.url),
  ]

  for (const url of candidates) {
    const filePath = fileURLToPath(url)
    if (existsSync(filePath)) {
      const pkg = JSON.parse(readFileSync(filePath, 'utf8')) as { version?: string }
      stream.write(`v${pkg.version ?? '0.0.0'}\n`)
      return
    }
  }

  stream.write('v0.0.0\n')
}
