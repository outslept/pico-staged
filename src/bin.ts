#!/usr/bin/env node

import process from 'node:process'
import { picoStaged } from './index.ts'
import type { PicoStagedOptions } from './types.ts'
import { getForceColorLevel, showVersion } from './utils.ts'

const forceColorLevel = getForceColorLevel()
if (forceColorLevel !== false) {
  process.env.FORCE_COLOR = forceColorLevel.toString()
}

process.on('SIGINT', () => {})

function showHelp(stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(
    [
      'Usage: pico-staged [options]',
      '',
      'Options:',
      '  -c, --config <path>      Path to configuration file',
      '  --diff [ref1] [ref2]     Run tasks for files changed between refs',
      '  -u, --unstaged           Run tasks for unstaged files',
      '  --allow-empty            Allow empty git commits when tasks revert all staged changes',
      '  --bail                   Stop executing tasks on first error',
      '  --quiet                  Disable console output from pico-staged',
      '  -v, --version            Output the version number',
      '  -h, --help               Display help for command',
      '',
    ].join('\n'),
  )
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options: PicoStagedOptions = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--config' || arg === '-c') {
      const next = argv[++i]
      if (next) {
        options.config = next
      }
    } else if (arg === '--unstaged' || arg === '-u') {
      options.unstaged = true
    } else if (arg === '--allow-empty') {
      options.allowEmpty = true
    } else if (arg === '--diff') {
      const refs: string[] = []
      for (let j = 0; j < 2; j++) {
        const nextArg = argv[i + 1]
        if (nextArg && !nextArg.startsWith('-')) {
          refs.push(nextArg)
          i++
        } else {
          break
        }
      }
      options.diff = refs.length > 0 ? refs : true
    } else if (arg === '--quiet') {
      options.quiet = true
    } else if (arg === '--bail') {
      options.bail = true
    } else if (arg === '--version' || arg === '-v') {
      showVersion(process.stdout)
      return
    } else if (arg === '--help' || arg === '-h') {
      showHelp(process.stdout)
      return
    }
  }

  try {
    await picoStaged(options)
  } catch {
    process.exitCode = 1
  }
}

runCli()
