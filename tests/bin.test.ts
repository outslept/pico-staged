import assert from "node:assert/strict";
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { executor } from "../src/executor.ts";
import { createGit } from "../src/git.ts";
import { appendFile, createTempDir, removeFile, writeFile } from "./utils/index.ts";

const BIN_PATH = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
const EXEC_ARGV = process.execArgv.filter(
  (arg: string, i: number, arr: string[]) =>
    !arg.startsWith("--test") && !arr[i - 1]?.startsWith("--test-"),
);

let cwd = "";

function execBin(args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return executor(process.execPath, [...EXEC_ARGV, BIN_PATH, ...args], {
    cwd,
    ...(env ? { env } : {}),
  });
}

beforeEach(async () => {
  cwd = await createTempDir("pico-bin-test-");
  const git = createGit(cwd);
  await git.exec(["init"]);
  await git.exec(["config", "core.autocrlf", "false"]);
  await git.exec(["config", "user.name", "test"]);
  await git.exec(["config", "user.email", "test@test.com"]);
  await appendFile("a.js", "const a = 1;\n", cwd);
  await git.add(["a.js"]);
  await git.exec(["commit", "-m", "initial"]);
});

afterEach(async () => {
  await removeFile(cwd);
});

test("prints help with --help and -h", async () => {
  const outLong = await execBin(["--help"]);
  assert.ok(outLong.includes("Usage: pico-staged [options]"));

  const outShort = await execBin(["-h"]);
  assert.equal(outShort, outLong);
});

test("prints version with --version and -v", async () => {
  const outLong = await execBin(["--version"]);
  assert.match(outLong, /^v\d+\.\d+\.\d+\n$/);

  const outShort = await execBin(["-v"]);
  assert.equal(outShort, outLong);
});

test("runs with --config, --unstaged, --diff, --quiet, --bail, and --allow-empty", async () => {
  const git = createGit(cwd);
  const configPath = join(cwd, "custom-config.json");
  await writeFile(
    "custom-config.json",
    JSON.stringify({ "*.js": `"${process.execPath}" -e "process.exit(0)"` }),
    cwd,
  );

  await writeFile("a.js", "const a = 2;\n", cwd);
  const unstagedOut = await execBin(["-c", configPath, "--unstaged"], { CLICOLOR_FORCE: "1" });
  assert.ok(unstagedOut.includes("Running tasks for unstaged files"));

  const diffBoolOut = await execBin(["--config", configPath, "--diff", "--quiet"]);
  assert.equal(diffBoolOut, "");

  await git.add(["a.js"]);
  await git.exec(["commit", "-m", "second"]);
  const diffRefsOut = await execBin(["-c", configPath, "--diff", "HEAD~1", "HEAD", "--bail"]);
  assert.ok(diffRefsOut.includes("Running tasks for changed files"));

  const revertScript = join(cwd, "revert.mjs");
  await writeFile(
    "revert.mjs",
    'import { writeFileSync } from "node:fs"; writeFileSync("a.js", "const a = 2;\\n");',
    cwd,
  );
  await writeFile(
    "custom-config.json",
    JSON.stringify({ "*.js": `"${process.execPath}" "${revertScript}"` }),
    cwd,
  );
  await writeFile("a.js", "const a = 3;\n", cwd);
  await git.add(["a.js"]);

  await assert.rejects(() => execBin(["-c", configPath]), /Prevented an empty git commit!/);

  await writeFile("a.js", "const a = 3;\n", cwd);
  await git.add(["a.js"]);
  await execBin(["-c", configPath, "--allow-empty", "--quiet"]);
});

test("exits with code 1 when picoStaged fails", async () => {
  await assert.rejects(() => execBin(["-c", "missing-file.json"]), /missing-file\.json/);
});
