import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, test } from "node:test";
import { createCmdRunner } from "../src/cmd-runner.ts";
import { PicoStagedError } from "../src/errors.ts";
import { createGit } from "../src/git.ts";
import { defineConfig, picoStaged } from "../src/index.ts";
import type { PipelineTask } from "../src/types.ts";
import {
  appendFile,
  createStdout,
  createTempDir,
  makeDir,
  removeFile,
  writeFile,
} from "./utils/index.ts";

let cwd = "";
let srcDir = "";

async function initGitRepo(dir: string): Promise<ReturnType<typeof createGit>> {
  const git = createGit(dir);
  await git.exec(["init"]);
  await git.exec(["config", "core.autocrlf", "false"]);
  await git.exec(["config", "user.name", "test"]);
  await git.exec(["config", "user.email", "test@test.com"]);
  return git;
}

beforeEach(async () => {
  cwd = await createTempDir("pico-runner-e2e-");
  srcDir = join(cwd, "src", "foo");
  await makeDir(srcDir);
  await writeFile("a.js", "const a = 1;\n", srcDir);
  await writeFile("b.js", "const b = 1;\n", srcDir);
  await writeFile("b.css", "body { color: red; }\n", cwd);
});

afterEach(async () => {
  await removeFile(cwd);
});

test("defineConfig returns the passed configuration", () => {
  const cfg = { "*.js": "eslint" };
  assert.equal(defineConfig(cfg), cfg);
});

test("cmd-runner generates tasks and matches files relative to cwd", async () => {
  const runner = createCmdRunner({
    rootPath: srcDir,
    cwd: srcDir,
    files: ["a.js", "../../b.css"],
    config: { "*.js": ["prettier --write"], "../*.css": "prettier --write" },
  });

  const groups = await runner.generateCmdTasks();
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.fileCount, 1);
  assert.equal(groups[0]?.tasks.length, 1);
  assert.equal(groups[0]?.tasks[0]?.title, "prettier --write");
  assert.equal(groups[1]?.fileCount, 0);
  assert.equal(groups[1]?.tasks.length, 0);
});

test("cmd-runner executes tasks and aborts sibling groups on --bail failure", async () => {
  const runner = createCmdRunner({
    rootPath: srcDir,
    cwd: srcDir,
    files: ["a.js", "b.js"],
    config: {
      "a.js": () => `${process.execPath} -e "console.error('fail a'); process.exit(1)"`,
      "b.js": () => `${process.execPath} -e "process.stdin.resume()"`,
    },
    bail: true,
  });

  const groups = await runner.generateCmdTasks();
  const parent: PipelineTask = {
    title: "Running tasks",
    tasks: groups,
    task: () => {},
  };

  await assert.rejects(() => runner.run(parent), /fail a/);
  assert.equal(groups[0]?.status, "fail");
  assert.equal(groups[1]?.status, "warn");
});

test("picoStaged throws expected PicoStagedError codes on invalid states", async () => {
  const stdout = createStdout();

  await assert.rejects(
    () => picoStaged({ cwd, stream: stdout }),
    (err: unknown) => err instanceof PicoStagedError && err.type === "noConfig",
  );

  await assert.rejects(
    () => picoStaged({ cwd, stream: stdout, config: "missing-config.json" }),
    (err: unknown) => err instanceof PicoStagedError && err.type === "noFileConfig",
  );

  await assert.rejects(
    () => picoStaged({ cwd, stream: stdout, config: {} }),
    (err: unknown) => err instanceof PicoStagedError && err.type === "invalidConfig",
  );

  await assert.rejects(
    () => picoStaged({ cwd, stream: stdout, config: { "*.js": "eslint" } }),
    (err: unknown) => err instanceof PicoStagedError && err.type === "noGitRepo",
  );

  const git = await initGitRepo(cwd);
  await assert.rejects(
    () => picoStaged({ cwd, stream: stdout, config: { "*.js": "eslint" } }),
    (err: unknown) => err instanceof PicoStagedError && err.type === "noFiles",
  );

  await git.add(["b.css"]);
  await assert.rejects(
    () => picoStaged({ cwd, stream: stdout, config: { "*.js": "eslint" } }),
    (err: unknown) => err instanceof PicoStagedError && err.type === "noMatchingFiles",
  );
});

test("picoStaged runs in unstaged and diff modes", async () => {
  const git = await initGitRepo(cwd);
  await appendFile("hello.js", "const x = 1;\n", cwd);
  await git.add(["hello.js"]);
  await git.exec(["commit", "-m", "init"]);

  await writeFile("hello.js", "const x = 2;\n", cwd);
  const stdout = createStdout();
  await picoStaged({
    cwd,
    unstaged: true,
    stream: stdout,
    config: { "*.js": () => `${process.execPath} -e "process.exit(0)"` },
  });
  assert.ok(stdout.out.includes("Running tasks for unstaged files"));

  await git.add(["hello.js"]);
  await git.exec(["commit", "-m", "second"]);
  stdout.out = "";
  await picoStaged({
    cwd,
    diff: ["HEAD~1", "HEAD"],
    stream: stdout,
    config: { "*.js": () => `${process.execPath} -e "process.exit(0)"` },
  });
  assert.ok(stdout.out.includes("Running tasks for changed files"));
});

test("picoStaged preserves unstaged changes on partially staged files and restores on error", async () => {
  const git = await initGitRepo(cwd);
  const filePath = join(cwd, "part.js");
  await writeFile("part.js", "line1\nline2\n", cwd);
  await git.add(["part.js"]);
  await git.exec(["commit", "-m", "initial"]);

  await writeFile("part.js", "LINE1\nline2\n", cwd);
  await git.add(["part.js"]);
  await writeFile("part.js", "LINE1\nline2\nunstaged\n", cwd);

  const stdout = createStdout();
  await picoStaged({
    cwd,
    stream: stdout,
    config: {
      "*.js": () => `${process.execPath} -e "process.exit(0)"`,
    },
  });

  const contentAfterSuccess = await readFile(filePath, "utf8");
  assert.equal(contentAfterSuccess, "LINE1\nline2\nunstaged\n");

  await assert.rejects(() =>
    picoStaged({
      cwd,
      stream: stdout,
      config: {
        "*.js": () => `${process.execPath} -e "process.exit(1)"`,
      },
    }),
  );

  const contentAfterRollback = await readFile(filePath, "utf8");
  assert.equal(contentAfterRollback, "LINE1\nline2\nunstaged\n");
});
