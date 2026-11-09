export type FileBucketType = 'staged' | 'unstaged' | 'changed'

export interface TaskFunctionContext {
  filenames: string[]
  type: FileBucketType
}

export type TaskResult = string | string[] | Promise<string | string[]>

export type TaskFunction = (ctx: TaskFunctionContext) => TaskResult

export type TaskConfigEntry = string | string[] | TaskFunction

export type PicoStagedConfigObject = Record<string, TaskConfigEntry>

export type PicoStagedConfig = PicoStagedConfigObject | TaskFunction

export interface PicoStagedOptions {
  allowEmpty?: boolean
  bail?: boolean
  config?: string | PicoStagedConfig
  cwd?: string
  diff?: boolean | string | [string, string] | string[]
  quiet?: boolean
  stream?: NodeJS.WritableStream
  unstaged?: boolean
}

export interface GlobOptions {
  extended?: boolean
  globstar?: boolean
  flags?: string
}

export interface GlobResult {
  regex: RegExp
}

export interface ExecutorOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  input?: string
  signal?: AbortSignal
}

export interface GitPaths {
  root: string
  dot: string
}

export interface GitStatusEntry {
  path: string
  rename?: string
  x: string
  y: string
}

export interface GitFileBuckets {
  working: string[]
  deleted: string[]
  changed: string[]
}

export type TaskStatus = 'pending' | 'run' | 'done' | 'warn' | 'fail' | 'skip'

export interface SubTaskItem {
  title: string
  pattern: string
  status?: TaskStatus
  run: (signal?: AbortSignal) => Promise<unknown>
}

export interface TaskGroupItem {
  title: string
  fileCount: number
  status?: TaskStatus
  tasks: SubTaskItem[]
}

export interface PipelineTask {
  title: string
  status?: TaskStatus
  skip?: () => string | boolean
  tasks?: TaskGroupItem[]
  task: (task: PipelineTask) => Promise<void> | void
}
