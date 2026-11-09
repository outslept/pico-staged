import process from 'node:process'
import { createCmdRunner } from './cmd-runner.ts'
import { PicoStagedError } from './errors.ts'
import { createGit } from './git.ts'
import { createGitWorkflow } from './git-workflow.ts'
import { createRenderer } from './renderer.ts'
import type { FileBucketType, PicoStagedConfigObject, PipelineTask } from './types.ts'

export interface RunnerContextOptions {
  allowEmpty?: boolean
  bail?: boolean
  config?: PicoStagedConfigObject
  cwd?: string
  diff?: boolean | string | [string, string] | string[]
  isTTY?: boolean
  quiet?: boolean
  stream?: NodeJS.WritableStream
  unstaged?: boolean
}

export interface Runner {
  run: () => Promise<void>
}

export function createRunner({
  allowEmpty = false,
  bail = false,
  config = {},
  cwd = process.cwd(),
  diff = false,
  isTTY = Boolean(process.stdout.isTTY),
  quiet = false,
  stream = process.stderr,
  unstaged = false,
}: RunnerContextOptions = {}): Runner {
  const renderer = createRenderer(stream, { isTTY, quiet })
  const git = createGit(cwd)

  const type: FileBucketType = diff ? 'changed' : unstaged ? 'unstaged' : 'staged'

  return {
    async run(): Promise<void> {
      const { root: rootPath, dot: dotPath } = await git.getGitPaths()
      if (!rootPath) {
        throw new PicoStagedError('noGitRepo')
      }

      const staged = await git.stagedFiles({ cwd: rootPath })
      const unstagedBuckets = await git.unstagedFiles({ cwd: rootPath })

      const targetBucket =
        type === 'changed'
          ? await git.changedFiles(diff, { cwd: rootPath })
          : type === 'unstaged'
            ? unstagedBuckets
            : staged

      if (targetBucket.working.length === 0) {
        throw new PicoStagedError('noFiles', type)
      }

      const cmdRunner = createCmdRunner({
        cwd,
        type,
        config,
        rootPath,
        bail,
        files: targetBucket.working,
      })

      const cmdTasks = await cmdRunner.generateCmdTasks()
      if (!cmdTasks.some((group) => group.fileCount > 0)) {
        throw new PicoStagedError('noMatchingFiles')
      }

      if (type === 'changed' || type === 'unstaged') {
        const singleTask: PipelineTask = {
          title: `Running tasks for ${type} files`,
          tasks: cmdTasks,
          task: (t) => cmdRunner.run(t),
        }

        renderer.add([singleTask])
        renderer.start()
        singleTask.status = 'run'
        renderer.update(singleTask)

        try {
          await singleTask.task(singleTask)
          singleTask.status = 'done'
          renderer.update(singleTask)
        } catch (err) {
          singleTask.status = 'fail'
          renderer.update(singleTask)
          throw err
        } finally {
          renderer.stop()
        }
        return
      }

      const workflow = createGitWorkflow({ allowEmpty, dotPath, rootPath })
      let cmdTasksFailed = false
      let gitApplyError = false
      let mergeStatusError = false

      const partlyStagedFiles = staged.working.filter((file) => unstagedBuckets.changed.includes(file))
      const hasPartlyStaged = partlyStagedFiles.length > 0
      const hasInitialStateBackup =
        partlyStagedFiles.length + staged.deleted.length + unstagedBuckets.deleted.length > 0

      const pipeline: PipelineTask[] = [
        {
          title: 'Preparing pico-staged',
          skip: () => !hasInitialStateBackup,
          task: () => workflow.backupOriginalState(),
        },
        {
          title: 'Backing up unstaged changes for staged files',
          skip: () => !hasPartlyStaged,
          task: () => workflow.backupUnstagedFiles(partlyStagedFiles),
        },
        {
          title: `Running tasks for ${type} files`,
          tasks: cmdTasks,
          task: (t) => cmdRunner.run(t),
        },
        {
          title: 'Applying modifications from tasks',
          skip: () => cmdTasksFailed,
          task: () => workflow.applyModifications(staged.working),
        },
        {
          title: 'Restoring unstaged changes for staged files',
          skip: () => !hasPartlyStaged || cmdTasksFailed || gitApplyError,
          task: () => workflow.restoreUnstagedFiles(partlyStagedFiles),
        },
        {
          title: 'Restoring to original state because of errors',
          skip: () =>
            !hasInitialStateBackup || !(cmdTasksFailed || gitApplyError || mergeStatusError),
          task: () => workflow.restoreOriginalState(),
        },
        {
          title: 'Cleaning up temporary patch files',
          skip: () =>
            !(workflow.hasPatch(workflow.patch.original) || workflow.hasPatch(workflow.patch.unstaged)),
          task: () => workflow.cleanUp(),
        },
      ]

      let runnerError: unknown
      renderer.add(pipeline)
      renderer.start()

      for (const step of pipeline) {
        if (step.skip?.()) {
          step.status = 'skip'
          renderer.update(step)
          continue
        }

        step.status = 'run'
        renderer.update(step)

        try {
          await step.task(step)
          step.status = 'done'
          renderer.update(step)
        } catch (err) {
          step.status = 'fail'
          renderer.update(step)

          if (step.title.startsWith('Running tasks')) {
            cmdTasksFailed = true
          } else if (step.title.startsWith('Applying modifications')) {
            gitApplyError = true
          } else if (step.title.startsWith('Restoring unstaged')) {
            mergeStatusError = true
          }

          runnerError = err
        }
      }

      await workflow.cleanUp()
      renderer.stop()

      if (runnerError) {
        throw runnerError
      }
    },
  }
}
