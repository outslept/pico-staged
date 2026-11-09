import assert from "node:assert/strict";
import process from "node:process";
import { beforeEach, test } from "node:test";
import { getForceColorLevel, showVersion, stringArgvToArray, toArray } from "../src/utils.ts";
import { createStdout } from "./utils/index.ts";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  delete process.env.CLICOLOR_FORCE;
  delete process.env.COLORTERM;
  delete process.env.CLICOLOR;
});

test("toArray normalizes single values and arrays", () => {
  assert.deepEqual(toArray("path"), ["path"]);
  assert.deepEqual(toArray(["path"]), ["path"]);
  assert.deepEqual(toArray(undefined), []);
  assert.deepEqual(toArray(null), []);
  assert.deepEqual(toArray(""), []);
});

test("showVersion writes package version", () => {
  const stdout = createStdout();
  showVersion(stdout);
  assert.match(stdout.out, /^v\d+\.\d+\.\d+\n$/);
});

test("stringArgvToArray parses quoted and unquoted arguments", () => {
  assert.deepEqual(stringArgvToArray("cmd --test config --test"), [
    "cmd",
    "--test",
    "config",
    "--test",
  ]);
  assert.deepEqual(stringArgvToArray("cmd --msg \"hello world\" 'single quoted'"), [
    "cmd",
    "--msg",
    "hello world",
    "single quoted",
  ]);
  assert.deepEqual(stringArgvToArray(""), []);
});

test("getForceColorLevel respects NO_COLOR and FORCE_COLOR", () => {
  assert.equal(getForceColorLevel(), false);

  process.env.FORCE_COLOR = "1";
  assert.equal(getForceColorLevel(), 1);

  process.env.FORCE_COLOR = "true";
  assert.equal(getForceColorLevel(), 1);

  process.env.FORCE_COLOR = "";
  assert.equal(getForceColorLevel(), 1);

  process.env.FORCE_COLOR = "false";
  assert.equal(getForceColorLevel(), 0);

  process.env.FORCE_COLOR = "3";
  assert.equal(getForceColorLevel(), 3);

  delete process.env.FORCE_COLOR;
  process.env.NO_COLOR = "1";
  assert.equal(getForceColorLevel(), false);
});
