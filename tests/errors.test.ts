import assert from "node:assert/strict";
import { test } from "node:test";
import { ERROR_MESSAGES, PicoStagedError, TaskRunnerError } from "../src/errors.ts";

test("PicoStagedError formats static and parameterized messages", () => {
  const noConfig = new PicoStagedError("noConfig");
  assert.ok(noConfig instanceof Error);
  assert.equal(noConfig.name, "PicoStagedError");
  assert.equal(noConfig.type, "noConfig");
  assert.equal(noConfig.message, ERROR_MESSAGES.noConfig);

  assert.equal(new PicoStagedError("invalidConfig").message, ERROR_MESSAGES.invalidConfig);
  assert.equal(new PicoStagedError("noGitRepo").message, ERROR_MESSAGES.noGitRepo);
  assert.equal(new PicoStagedError("noMatchingFiles").message, ERROR_MESSAGES.noMatchingFiles);

  assert.equal(
    new PicoStagedError("noFileConfig", "no-config.js").message,
    "Pico Staged config file *no-config.js* is not found.",
  );
  assert.equal(new PicoStagedError("noFiles", "staged").message, "No staged files found.");
});

test("TaskRunnerError has correct name and message", () => {
  const err = new TaskRunnerError("task error");
  assert.ok(err instanceof Error);
  assert.equal(err.name, "TaskRunnerError");
  assert.equal(err.message, "task error");
});
