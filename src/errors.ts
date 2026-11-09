export type ErrorCode =
  | 'noConfig'
  | 'noFileConfig'
  | 'invalidConfig'
  | 'noGitRepo'
  | 'noFiles'
  | 'noMatchingFiles'

export const ERROR_MESSAGES = {
  noConfig: 'Create Pico Staged config.',
  noFileConfig: (path: string): string => `Pico Staged config file *${path}* is not found.`,
  invalidConfig: 'Pico Staged config invalid.',
  noGitRepo: 'Pico Staged didn’t find git directory.',
  noFiles: (type: string): string => `No ${type} files found.`,
  noMatchingFiles: 'No files match any configured task.',
} as const

export class PicoStagedError extends Error {
  readonly type: ErrorCode

  constructor(type: ErrorCode, arg = '') {
    const template = ERROR_MESSAGES[type]
    const message = typeof template === 'function' ? template(arg) : template
    super(message)
    this.name = 'PicoStagedError'
    this.type = type
  }
}

export class TaskRunnerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaskRunnerError'
  }
}
