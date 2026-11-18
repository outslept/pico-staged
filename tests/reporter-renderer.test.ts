import assert from "node:assert/strict";
import { test } from "node:test";
import { PicoStagedError, TaskRunnerError } from "../src/errors.ts";
import { createRenderer } from "../src/renderer.ts";
import { createReporter } from "../src/reporter.ts";
import type { PipelineTask } from "../src/types.ts";
import { createStdout } from "./utils/index.ts";

test("reporter formats PicoStagedError, TaskRunnerError, Error, and unknown values", () => {
  const stdout = createStdout();
  const reporter = createReporter(stdout);

  reporter.error(new PicoStagedError("noFiles", "staged"));
  assert.ok(stdout.out.includes("No staged files found."));

  stdout.out = "";
  reporter.error(new PicoStagedError("noMatchingFiles"));
  assert.ok(stdout.out.includes("No files match any configured task."));

  stdout.out = "";
  reporter.error(new PicoStagedError("noFileConfig", "missing.json"));
  assert.ok(stdout.out.includes("missing.json"));

  stdout.out = "";
  reporter.error(new TaskRunnerError("custom task failure"));
  assert.equal(stdout.out, "\ncustom task failure\n");

  stdout.out = "";
  reporter.error(new Error("generic boom"));
  assert.ok(stdout.out.includes("generic boom"));

  stdout.out = "";
  reporter.error("plain string error");
  assert.equal(stdout.out, "plain string error\n");
});

test("renderer outputs flat lines in non-TTY mode and suppresses output in quiet mode", () => {
  const stdout = createStdout();
  const ciRenderer = createRenderer(stdout, { isTTY: false, quiet: false });

  const runningParent: PipelineTask = {
    title: "Running tasks",
    status: "run",
    tasks: [{ title: "*.js", fileCount: 1, tasks: [] }],
    task: () => {},
  };
  ciRenderer.update(runningParent);
  assert.equal(stdout.out, "");

  const skippedStep: PipelineTask = {
    title: "Backing up",
    skip: () => "nothing to backup",
    task: () => {},
  };
  ciRenderer.update(skippedStep);
  assert.ok(stdout.out.includes("Backing up"));
  assert.ok(stdout.out.includes("nothing to backup..."));

  stdout.out = "";
  ciRenderer.update({
    title: "eslint",
    pattern: "*.js",
    status: "done",
    run: async () => "",
  });
  assert.ok(stdout.out.includes("*.js"));
  assert.ok(stdout.out.includes("eslint"));

  stdout.out = "";
  const quietRenderer = createRenderer(stdout, { isTTY: false, quiet: true });
  quietRenderer.update({ title: "Step", status: "done", task: () => {} });
  assert.equal(stdout.out, "");
});

test("renderer renders interactive tree in TTY mode", () => {
  const stdout = createStdout();
  const ttyRenderer = createRenderer(stdout, { isTTY: true, quiet: false });

  const tasks: PipelineTask[] = [
    {
      title: "Preparing",
      skip: () => "skipped reason",
      task: () => {},
    },
    {
      title: "Running tasks",
      status: "done",
      tasks: [
        {
          title: "*.js - 1 file",
          fileCount: 1,
          status: "done",
          tasks: [
            {
              title: "prettier --write",
              pattern: "*.js",
              status: "done",
              run: async () => "",
            },
          ],
        },
      ],
      task: () => {},
    },
  ];

  ttyRenderer.add(tasks);
  ttyRenderer.start();
  ttyRenderer.update(tasks[1]!);
  ttyRenderer.stop();

  assert.ok(stdout.out.includes("\u001B[?25l"));
  assert.ok(stdout.out.includes("Preparing"));
  assert.ok(stdout.out.includes("skipped reason..."));
  assert.ok(stdout.out.includes("prettier --write"));
  assert.ok(stdout.out.includes("\u001B[?25h"));
});
