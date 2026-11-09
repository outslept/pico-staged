import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { executor } from "./executor.ts";
import type { ExecutorOptions, GitFileBuckets, GitPaths, GitStatusEntry } from "./types.ts";
import { toArray } from "./utils.ts";

const STAGED_CODE = 1 << 0;
const CHANGED_CODE = 1 << 1;
const DELETED_CODE = 1 << 2;

const STATUS_MAP: Record<string, number> = {
  " ": 0,
  M: CHANGED_CODE,
  A: STAGED_CODE,
  D: DELETED_CODE,
  R: STAGED_CODE,
  C: STAGED_CODE,
  U: 0,
  "?": 0,
  "!": 0,
};

export const APPLY_ARGS = ["-v", "--whitespace=nowarn", "--recount", "--unidiff-zero"] as const;

export const DIFF_ARGS = [
  "--binary",
  "--unified=0",
  "--no-color",
  "--no-ext-diff",
  "--src-prefix=a/",
  "--dst-prefix=b/",
  "--patch",
  "--submodule=short",
] as const;

function parsePorcelainStatus(raw: string): GitStatusEntry[] {
  const tokens = raw.split("\u0000");
  const entries: GitStatusEntry[] = [];

  let i = 0;
  while (i < tokens.length - 1) {
    const token = tokens[i] ?? "";
    if (token.length < 4) {
      i++;
      continue;
    }

    const x = token[0] ?? " ";
    const y = token[1] ?? " ";
    const path = token.slice(3);
    const entry: GitStatusEntry = { x, y, path };

    if (x === "R" || x === "C") {
      const renameTarget = tokens[i + 1];
      if (renameTarget) {
        entry.rename = renameTarget;
      }
      i++;
    }

    entries.push(entry);
    i++;
  }

  return entries;
}

function getStagedMask({ x }: GitStatusEntry): number {
  const code = STATUS_MAP[x] ?? 0;
  return code !== 0 ? code | STAGED_CODE : 0;
}

function getUnstagedMask({ y }: GitStatusEntry): number {
  return STATUS_MAP[y] ?? 0;
}

function groupFilesByStatus(
  entries: GitStatusEntry[],
  resolveMask: (entry: GitStatusEntry) => number,
): GitFileBuckets {
  const working: string[] = [];
  const deleted: string[] = [];
  const changed: string[] = [];

  for (const entry of entries) {
    const mask = resolveMask(entry);
    if (!mask) {
      continue;
    }

    if (mask & CHANGED_CODE) {
      changed.push(entry.path);
    }

    if (mask & DELETED_CODE) {
      deleted.push(entry.path);
    } else {
      working.push(entry.path);
    }
  }

  return { working, deleted, changed };
}

function createCleanGitEnv(customEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...customEnv };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return env;
}

export interface GitClient {
  exec: (args?: string[], opts?: ExecutorOptions) => Promise<string>;
  diff: (fileName: string, files?: string | string[], opts?: ExecutorOptions) => Promise<string>;
  diffFileName: (
    ref1?: string | string[] | boolean,
    ref2?: string | string[],
    opts?: ExecutorOptions,
  ) => Promise<string>;
  apply: (patch: string, allowConflicts?: boolean, opts?: ExecutorOptions) => Promise<string>;
  getGitPaths: (opts?: ExecutorOptions) => Promise<GitPaths>;
  add: (paths?: string | string[], opts?: ExecutorOptions) => Promise<string>;
  checkout: (paths?: string | string[], opts?: ExecutorOptions) => Promise<string>;
  status: (opts?: ExecutorOptions) => Promise<GitStatusEntry[]>;
  changedFiles: (
    refs?: string | string[] | boolean,
    opts?: ExecutorOptions,
  ) => Promise<GitFileBuckets>;
  stagedFiles: (opts?: ExecutorOptions) => Promise<GitFileBuckets>;
  unstagedFiles: (opts?: ExecutorOptions) => Promise<GitFileBuckets>;
}

export function createGit(defaultCwd: string = process.cwd()): GitClient {
  const exec = (args: string[] = [], opts: ExecutorOptions = {}): Promise<string> =>
    executor("git", args, {
      cwd: defaultCwd,
      ...opts,
      env: createCleanGitEnv(opts.env),
    });

  const diff = (
    fileName: string,
    files: string | string[] = [],
    opts: ExecutorOptions = {},
  ): Promise<string> =>
    exec(["diff", ...DIFF_ARGS, "--output", fileName, "--", ...toArray(files)], opts);

  const diffFileName = (
    ref1: string | string[] | boolean = [],
    ref2: string | string[] = [],
    opts: ExecutorOptions = {},
  ): Promise<string> => {
    const normalizedRef1 = typeof ref1 === "boolean" ? [] : toArray(ref1);
    const normalizedRef2 = toArray(ref2);
    return exec(
      [
        "diff",
        "--name-only",
        "--no-ext-diff",
        "--diff-filter=ACMR",
        "-z",
        ...normalizedRef1,
        ...normalizedRef2,
        "--",
      ],
      opts,
    );
  };

  const apply = (
    patch: string,
    allowConflicts = false,
    opts: ExecutorOptions = {},
  ): Promise<string> =>
    exec(["apply", ...APPLY_ARGS, ...(allowConflicts ? ["-3"] : []), patch], opts);

  const getGitPaths = async (opts: ExecutorOptions = {}): Promise<GitPaths> => {
    try {
      const topLevel = (await exec(["rev-parse", "--show-toplevel"], opts)).trim();
      const root = realpathSync(topLevel);
      let dot = realpathSync(join(root, ".git"));

      if (lstatSync(dot).isFile()) {
        const content = readFileSync(dot, "utf8");
        const gitDirMatch = /^gitdir:\s*(.+)$/m.exec(content);
        if (gitDirMatch?.[1]) {
          dot = resolve(root, gitDirMatch[1].trim());
        }
      }

      return { root, dot };
    } catch {
      return { root: "", dot: "" };
    }
  };

  const add = (paths: string | string[] = [], opts: ExecutorOptions = {}): Promise<string> =>
    exec(["add", "-A", "--", ...toArray(paths)], opts);

  const checkout = (paths: string | string[] = [], opts: ExecutorOptions = {}): Promise<string> =>
    exec(["checkout", "-q", "--force", "--", ...toArray(paths)], opts);

  const status = async (opts: ExecutorOptions = {}): Promise<GitStatusEntry[]> => {
    try {
      const raw = await exec(["status", "-z", "-u"], {
        ...opts,
        env: { ...opts.env, GIT_OPTIONAL_LOCKS: "0" },
      });
      return parsePorcelainStatus(raw);
    } catch {
      return [];
    }
  };

  const changedFiles = async (
    refs: string | string[] | boolean = [],
    opts: ExecutorOptions = {},
  ): Promise<GitFileBuckets> => {
    try {
      const raw = await diffFileName(refs, [], opts);
      return {
        working: raw.split("\u0000").filter(Boolean),
        deleted: [],
        changed: [],
      };
    } catch {
      return { working: [], deleted: [], changed: [] };
    }
  };

  const stagedFiles = async (opts: ExecutorOptions = {}): Promise<GitFileBuckets> => {
    const entries = await status(opts);
    return groupFilesByStatus(entries, getStagedMask);
  };

  const unstagedFiles = async (opts: ExecutorOptions = {}): Promise<GitFileBuckets> => {
    const entries = await status(opts);
    return groupFilesByStatus(entries, getUnstagedMask);
  };

  return {
    exec,
    diff,
    diffFileName,
    apply,
    getGitPaths,
    add,
    checkout,
    status,
    changedFiles,
    stagedFiles,
    unstagedFiles,
  };
}
