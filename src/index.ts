import process from "node:process";
import { getConfig, validConfig } from "./config.ts";
import { PicoStagedError } from "./errors.ts";
import { createReporter } from "./reporter.ts";
import { createRunner } from "./runner.ts";
import type { PicoStagedConfig, PicoStagedOptions } from "./types.ts";

export type {
  ExecutorOptions,
  FileBucketType,
  GitFileBuckets,
  GitPaths,
  GitStatusEntry,
  GlobOptions,
  GlobResult,
  PicoStagedConfig,
  PicoStagedConfigObject,
  PicoStagedOptions,
  PipelineTask,
  SubTaskItem,
  TaskConfigEntry,
  TaskFunction,
  TaskFunctionContext,
  TaskGroupItem,
  TaskResult,
  TaskStatus,
} from "./types.ts";

export { ERROR_MESSAGES, PicoStagedError, TaskRunnerError } from "./errors.ts";

export function defineConfig(config: PicoStagedConfig): PicoStagedConfig {
  return config;
}

export async function picoStaged({
  stream = process.stderr,
  cwd = process.cwd(),
  allowEmpty = false,
  config: explicitConfig,
  unstaged = false,
  diff = false,
  quiet = false,
  bail = false,
}: PicoStagedOptions = {}): Promise<void> {
  const reporter = createReporter(stream);

  try {
    const loadedConfig = await getConfig(cwd, explicitConfig);

    if (!loadedConfig) {
      throw new PicoStagedError("noConfig");
    }

    if (typeof explicitConfig === "string" && Object.keys(loadedConfig).length === 0) {
      throw new PicoStagedError("noFileConfig", explicitConfig);
    }

    if (!validConfig(loadedConfig)) {
      throw new PicoStagedError("invalidConfig");
    }

    const runner = createRunner({
      allowEmpty,
      bail,
      config: loadedConfig,
      cwd,
      diff,
      quiet,
      stream,
      unstaged,
    });

    await runner.run();
  } catch (err) {
    reporter.error(err);
    throw err;
  }
}

export default picoStaged;
