import assert from "node:assert/strict";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { getConfig, validConfig } from "../src/config.ts";
import { createTempDir, fixture, removeFile, writeFile } from "./utils/index.ts";

test("returns undefined when no config exists in isolated directory tree", async () => {
  const dir = await createTempDir("pico-no-config-");
  try {
    const config = await getConfig(dir);
    assert.equal(config, undefined);
  } finally {
    await removeFile(dir);
  }
});

test("returns empty object when explicit config file does not exist or has unsupported ext", async () => {
  assert.deepEqual(await getConfig(process.cwd(), "non-existent-pico-staged.json"), {});
  assert.deepEqual(await getConfig(process.cwd(), "config.yaml"), {});
});

test("returns empty object when JSON config file is malformed", async () => {
  const dir = await createTempDir("pico-bad-json-");
  try {
    await writeFile(".pico-staged.json", "{ invalid json", dir);
    assert.deepEqual(await getConfig(dir), {});
  } finally {
    await removeFile(dir);
  }
});

test("loads config from package.json upward", async () => {
  const config = await getConfig(fixture("config/test-project/dir"));
  assert.deepEqual(config, { "*": "my-tasks" });
});

test("returns explicit object config", async () => {
  const config = await getConfig(process.cwd(), { "*": "my-tasks" });
  assert.deepEqual(config, { "*": "my-tasks" });
});

test("wraps explicit function config under wildcard key", async () => {
  const fn = () => "my-tasks";
  const config = await getConfig(process.cwd(), fn);
  assert.equal(config?.["*"], fn);
});

test("loads JSON config file", async () => {
  const config = await getConfig(fixture("config/json"));
  assert.deepEqual(config, { "*": "my-tasks" });
});

test("loads ESM config from .js file", async () => {
  const config = await getConfig(fixture("config/esm-in-js"));
  const entry = config?.["*"];
  assert.equal(typeof entry, "function");
  if (typeof entry === "function") {
    assert.equal(await entry({ filenames: [], type: "staged" }), "my-tasks");
  }
});

test("loads CJS config from .js file", async () => {
  const config = await getConfig(fixture("config/cjs-in-js"));
  assert.deepEqual(config, { "*": "my-tasks" });
});

test("loads ESM function config from .mjs file", async () => {
  const config = await getConfig(fixture("config/mjs"));
  const entry = config?.["*"];
  assert.equal(typeof entry, "function");
  if (typeof entry === "function") {
    assert.equal(await entry({ filenames: [], type: "staged" }), "my-tasks");
  }
});

test("loads CJS config from .cjs file", async () => {
  const config = await getConfig(fixture("config/cjs"));
  assert.deepEqual(config, { "*": "my-tasks" });
});

test("loads CJS config from explicit relative and absolute paths", async () => {
  const absConfig = await getConfig(process.cwd(), fixture("config/cjs/pico-staged.cjs"));
  assert.deepEqual(absConfig, { "*": "my-tasks" });

  const relConfig = await getConfig(
    process.cwd(),
    join("tests", "fixtures", "config", "cjs", "pico-staged.cjs"),
  );
  assert.deepEqual(relConfig, { "*": "my-tasks" });
});

test("loads .picostagedrc without extension", async () => {
  const config = await getConfig(fixture("config/no-ext"));
  assert.deepEqual(config, { "*": "my-tasks" });
});

test("validConfig validates config structures accurately", () => {
  assert.equal(validConfig(undefined), false);
  assert.equal(validConfig(null), false);
  assert.equal(validConfig([]), false);
  assert.equal(validConfig({}), false);
  assert.equal(validConfig({ "*": "my-tasks" }), true);
  assert.equal(validConfig({ "*": ["my-tasks"] }), true);
  assert.equal(validConfig({ "*": () => "my-tasks" }), true);
  assert.equal(validConfig({ "": ["my-tasks"] }), false);
  assert.equal(validConfig({ "*": "" }), false);
  assert.equal(validConfig({ "*": [] }), false);
  assert.equal(validConfig({ "*": ["", ""] }), false);
  assert.equal(validConfig({ "": 1 }), false);
  assert.equal(validConfig({ "": "" }), false);
  assert.equal(validConfig({ "*": "", "*.js": "my-task" }), false);
});
