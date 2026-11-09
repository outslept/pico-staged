import { isAbsolute, normalize, relative, resolve } from "node:path";
import process from "node:process";
import { styleText } from "node:util";
import { TaskRunnerError } from "./errors.ts";
import { executor } from "./executor.ts";
import { globToRegex } from "./glob.ts";
import type {
  FileBucketType,
  PicoStagedConfigObject,
  PipelineTask,
  SubTaskItem,
  TaskGroupItem,
} from "./types.ts";
import { stringArgvToArray, toArray } from "./utils.ts";

export interface CmdRunnerOptions {
  cwd?: string;
  type?: FileBucketType;
  rootPath?: string;
  config?: PicoStagedConfigObject;
  files?: string[];
  bail?: boolean;
}

export interface CmdRunner {
  generateCmdTasks: () => Promise<TaskGroupItem[]>;
  run: (parentTask: PipelineTask) => Promise<void>;
}

export function createCmdRunner({
  cwd = process.cwd(),
  type = "staged",
  rootPath = "",
  config = {},
  files = [],
  bail = false,
}: CmdRunnerOptions = {}): CmdRunner {
  const generateCmdTasks = async (): Promise<TaskGroupItem[]> => {
    const groups: TaskGroupItem[] = [];

    for (const [pattern, cmds] of Object.entries(config)) {
      const isFn = typeof cmds === "function";
      const matches = globToRegex(pattern, {
        extended: true,
        globstar: pattern.includes("/"),
      });

      const matchedFiles: string[] = [];
      for (const rawFile of files) {
        const relFile = normalize(relative(cwd, normalize(resolve(rootPath, rawFile)))).replace(
          /\\/g,
          "/",
        );
        if (!pattern.startsWith("../") && (relFile.startsWith("..") || isAbsolute(relFile))) {
          continue;
        }
        if (matches.regex.test(relFile)) {
          matchedFiles.push(resolve(cwd, relFile));
        }
      }

      const fileCount = matchedFiles.length;
      const suffix = fileCount ? `${fileCount} ${fileCount > 1 ? "files" : "file"}` : "no files";
      const title = pattern + styleText("dim", ` - ${suffix}`);

      const resolvedCommands = toArray(isFn ? await cmds({ filenames: matchedFiles, type }) : cmds);

      const tasks: SubTaskItem[] = [];
      for (const command of resolvedCommands) {
        const [cmd, ...args] = stringArgvToArray(command);
        if (!cmd || fileCount === 0) {
          continue;
        }

        tasks.push({
          title: command,
          pattern,
          run: async (signal?: AbortSignal) =>
            executor(cmd, isFn ? args : [...args, ...matchedFiles], {
              cwd: rootPath,
              ...(signal ? { signal } : {}),
            }),
        });
      }

      groups.push({
        title,
        fileCount,
        tasks,
      });
    }

    return groups;
  };

  const runGroup = async (
    group: TaskGroupItem,
    errors: string[],
    controller?: AbortController,
  ): Promise<void> => {
    let failedCount = 0;
    let aborted = false;

    group.status = "run";
    for (const subTask of group.tasks) {
      if (failedCount > 0 || aborted) {
        subTask.status = "warn";
        continue;
      }

      subTask.status = "run";
      try {
        await subTask.run(controller?.signal);
        subTask.status = "done";
      } catch (err: unknown) {
        if (controller?.signal.aborted) {
          aborted = true;
          subTask.status = "warn";
        } else {
          failedCount++;
          subTask.status = "fail";
          controller?.abort();
          const detail = (err instanceof Error ? err.message : String(err)).trim();
          errors.push(
            `${styleText("red", subTask.pattern)} ${styleText("dim", ">")} ${subTask.title}:\n${detail}`,
          );
        }
      }
    }

    if (failedCount > 0) {
      group.status = "fail";
    } else if (aborted || group.fileCount === 0) {
      group.status = "warn";
    } else {
      group.status = "done";
    }
  };

  const run = async (parentTask: PipelineTask): Promise<void> => {
    const errors: string[] = [];
    const controller = bail ? new AbortController() : undefined;
    const groups = parentTask.tasks ?? [];

    await Promise.all(groups.map((group) => runGroup(group, errors, controller)));

    if (errors.length > 0) {
      throw new TaskRunnerError(errors.join("\n\n"));
    }
  };

  return {
    generateCmdTasks,
    run,
  };
}
