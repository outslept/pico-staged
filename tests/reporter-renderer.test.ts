import assert from "node:assert/strict";
import { test } from "node:test";
import { PicoStagedError, TaskRunnerError } from "../src/errors.ts";
import { createRenderer } from "../src/renderer.ts";
import { createReporter } from "../src/reporter.ts";
import type { PipelineTask } from "../src/types.ts";
import { createStdout } from "./utils/index.ts";

test("reporter formats PicoStagedError, TaskRunnerError, and generic errors", () => {
  const stdout = createStdout();
  const reporter = createReporter(stdout);

  reporter.error(new PicoStagedError("noFiles", "staged"));
  assert.ok(stdout.out.includes("No staged files found."));

  stdout.out = "";
  reporter.error(new PicoStagedError("noFileConfig", "missing.json"));
  assert.ok(stdout.out.includes("missing.json"));

  stdout.out = "";
  reporter.error(new TaskRunnerError("custom task failure"));
  assert.equal(stdout.out, "\ncustom task failure\n");

  stdout.out = "";
  reporter.error(new Error("generic boom"));
  assert.ok(stdout.out.includes("generic boom"));
});

test("renderer outputs flat lines in non-TTY mode and suppresses output in quiet mode", () => {
  const stdout = createStdout();
  const ciRenderer = createRenderer(stdout, { isTTY: false, quiet: false });

  const step: PipelineTask = {
    title: "Preparing pico-staged",
    status: "done",
    task: () => {},
  };

  ciRenderer.update(step);
  assert.ok(stdout.out.includes("Preparing pico-staged"));

  stdout.out = "";
  const quietRenderer = createRenderer(stdout, { isTTY: false, quiet: true });
  quietRenderer.update(step);
  assert.equal(stdout.out, "");
});
