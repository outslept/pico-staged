import assert from "node:assert/strict";
import { test } from "node:test";
import { PicoStagedError, TaskRunnerError } from "../src/errors.ts";

test("PicoStagedError has correct name, type, and message", () => {
  const err = new PicoStagedError("noConfig");
  assert.equal(err.name, "PicoStagedError");
  assert.equal(err.type, "noConfig");
  assert.equal(err.message, "Create Pico Staged config.");
});

test("PicoStagedError formats file path argument", () => {
  const err = new PicoStagedError("noFileConfig", "no-config.js");
  assert.equal(err.message, "Pico Staged config file *no-config.js* is not found.");
});

test("PicoStagedError formats file bucket type", () => {
  const err = new PicoStagedError("noFiles", "staged");
  assert.equal(err.message, "No staged files found.");
});

test("TaskRunnerError has correct name and message", () => {
  const err = new TaskRunnerError("task error");
  assert.equal(err.name, "TaskRunnerError");
  assert.equal(err.message, "task error");
});
