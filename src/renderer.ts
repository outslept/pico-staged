import { clearLine, cursorTo, moveCursor } from 'node:readline'
import { styleText } from 'node:util'
import type { PipelineTask, SubTaskItem, TaskGroupItem } from './types.ts'

const SPINNER = ['-', '\\', '|', '/'] as const

type RenderNode = PipelineTask | TaskGroupItem | SubTaskItem

function getSymbol(task: RenderNode, spinnerIdx = 0): string {
  switch (task.status) {
    case 'run':
      return styleText('yellow', SPINNER[spinnerIdx] ?? '-')
    case 'done':
      return styleText('green', '√')
    case 'fail':
      return styleText('red', '×')
    case 'warn':
      return styleText('yellow', '↓')
    case 'skip':
      return styleText('gray', '-')
    default:
      return styleText('dim', '*')
  }
}

export interface RendererOptions {
  isTTY?: boolean
  quiet?: boolean
}

export interface Renderer {
  add: (tasks?: PipelineTask[]) => void
  update: (task: RenderNode) => void
  start: () => void
  stop: () => void
}

export function createRenderer(
  stream: NodeJS.WritableStream,
  { isTTY = true, quiet = false }: RendererOptions = {},
): Renderer {
  if (quiet) {
    return {
      add() {},
      update() {},
      start() {},
      stop() {},
    }
  }

  let lines = 0
  let spinnerIdx = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let rootTasks: PipelineTask[] = []

  const clear = (): void => {
    for (let i = 0; i < lines; i++) {
      moveCursor(stream, 0, -1)
      clearLine(stream, 0)
      cursorTo(stream, 0)
    }
    lines = 0
  }

  const writeLine = (message: string, depth = 0): void => {
    lines++
    stream.write(`${'  '.repeat(depth)}${message}\n`)
  }

  const writeReason = (reason: string, depth = 1): void => {
    const icon = styleText('dim', '→')
    const text = styleText('gray', `${reason}...`)
    writeLine(`${icon} ${text}`, depth)
  }

  const renderTree = (nodes: RenderNode[], depth = 0): void => {
    for (const node of nodes) {
      let skipReason: string | boolean = false

      if ('skip' in node && typeof node.skip === 'function') {
        skipReason = node.skip()
        if (skipReason && !node.status) {
          node.status = 'skip'
        }
      }

      if (node.status) {
        const icon = getSymbol(node, spinnerIdx)
        writeLine(`${icon} ${node.title}`, depth)

        if (node.status === 'skip' && typeof skipReason === 'string') {
          writeReason(skipReason, depth + 1)
        } else if ('tasks' in node && Array.isArray(node.tasks) && node.tasks.length > 0) {
          renderTree(node.tasks, depth + 1)
        }
      }
    }
  }

  const updateTTY = (): void => {
    clear()
    renderTree(rootTasks)
  }

  const updateNonTTY = (node: RenderNode): void => {
    let skipReason: string | boolean = false
    if ('skip' in node && typeof node.skip === 'function') {
      skipReason = node.skip()
      if (skipReason && !node.status) {
        node.status = 'skip'
      }
    }

    if (node.status) {
      if (node.status === 'run' && 'tasks' in node && Array.isArray(node.tasks) && node.tasks.length > 0) {
        return
      }

      const icon = getSymbol(node)
      const sep = styleText('dim', ' ≫ ')

      if (node.status === 'skip' && typeof skipReason === 'string') {
        writeLine(`${icon} ${node.title}${sep}${styleText('gray', `${skipReason}...`)}`)
      } else if ('pattern' in node && typeof node.pattern === 'string') {
        writeLine(`${icon} ${node.pattern}${sep}${node.title}`)
      } else {
        writeLine(`${icon} ${node.title}`)
      }
    }
  }

  if (isTTY) {
    return {
      add(tasks: PipelineTask[] = []): void {
        rootTasks = tasks
      },
      update(): void {
        updateTTY()
      },
      start(): void {
        stream.write('\u001B[?25l')
        timer = setInterval(() => {
          spinnerIdx = (spinnerIdx + 1) % SPINNER.length
          updateTTY()
        }, 130)
      },
      stop(): void {
        if (timer) {
          clearInterval(timer)
        }
        updateTTY()
        stream.write('\u001B[?25h')
      },
    }
  }

  return {
    add() {},
    update(node: RenderNode): void {
      updateNonTTY(node)
    },
    start() {},
    stop() {},
  }
}
