import { rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGit } from './git.ts'

export const PATCH_UNSTAGED = 'pico-staged_partial.patch'
export const PATCH_ORIGINAL = 'pico-staged.patch'

export interface GitWorkflowOptions {
  allowEmpty?: boolean
  dotPath?: string
  rootPath?: string
}

export interface GitWorkflow {
  patch: {
    unstaged: string
    original: string
  }
  hasPatch: (filePath: string) => boolean
  backupOriginalState: () => Promise<void>
  backupUnstagedFiles: (files?: string[]) => Promise<void>
  applyModifications: (files?: string[]) => Promise<void>
  restoreUnstagedFiles: (files?: string[]) => Promise<void>
  restoreOriginalState: () => Promise<void>
  cleanUp: () => Promise<void>
}

export function createGitWorkflow({
  allowEmpty = false,
  dotPath = '',
  rootPath = '',
}: GitWorkflowOptions = {}): GitWorkflow {
  const git = createGit(rootPath)
  const patch = {
    unstaged: resolve(dotPath, PATCH_UNSTAGED),
    original: resolve(dotPath, PATCH_ORIGINAL),
  }

  const hasPatch = (filePath: string): boolean => {
    try {
      return statSync(filePath).size > 0
    } catch {
      return false
    }
  }

  const backupOriginalState = async (): Promise<void> => {
    await git.diff(patch.original)
  }

  const backupUnstagedFiles = async (files: string[] = []): Promise<void> => {
    await git.diff(patch.unstaged, files)
    await git.checkout(files)
  }

  const applyModifications = async (files: string[] = []): Promise<void> => {
    let modified = ''
    try {
      modified = await git.exec(['diff', 'HEAD'])
    } catch {
      modified = await git.exec(['diff', '--cached'])
    }

    const hasDiff = modified.trim().length > 0
    if (!hasDiff && !allowEmpty) {
      throw new Error('Prevented an empty git commit!')
    }

    if (files.length > 0) {
      await git.add(files)
    }
  }

  const restoreUnstagedFiles = async (files: string[] = []): Promise<void> => {
    try {
      await git.apply(patch.unstaged)
    } catch {
      try {
        await git.apply(patch.unstaged, true)
      } catch {
        throw new Error('Merge conflict!!! Unstaged changes not restored.')
      }

      if (files.length > 0) {
        await git.exec(['rerere'])
        await git.add(files)
      }
    }
  }

  const restoreOriginalState = async (): Promise<void> => {
    await git.checkout('.')
    if (hasPatch(patch.original)) {
      await git.apply(patch.original)
    }
  }

  const cleanUp = async (): Promise<void> => {
    rmSync(patch.original, { force: true })
    rmSync(patch.unstaged, { force: true })
  }

  return {
    patch,
    hasPatch,
    backupOriginalState,
    backupUnstagedFiles,
    applyModifications,
    restoreUnstagedFiles,
    restoreOriginalState,
    cleanUp,
  }
}
