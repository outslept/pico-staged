import assert from "node:assert/strict";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { getConfig, validConfig } from "../src/config.ts";
import { fixture } from "./utils/index.ts";

test("returns undefined when config file is not found in isolated root", async () => {
  const emptyConfig = await getConfig(process.cwd(), "non-existent-pico-staged.json");
  assert.deepEqual(emptyConfig, {});
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
  assert.equal(validConfig({}), false);
  assert.equal(validConfig({ "*": "my-tasks" }), true);
  assert.equal(validConfig({ "*": ["my-tasks"] }), true);
  assert.equal(validConfig({ "*": () => "my-tasks" }), true);
  assert.equal(validConfig({ "": ["my-tasks"] }), false);
  assert.equal(validConfig({ "*": "" }), false);
  assert.equal(validConfig({ "*": ["", ""] }), false);
  assert.equal(validConfig({ "": 1 }), false);
  assert.equal(validConfig({ "": "" }), false);
  assert.equal(validConfig({ "*": "", "*.js": "my-task" }), false);
});
