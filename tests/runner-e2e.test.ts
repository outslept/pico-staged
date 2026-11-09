import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createCmdRunner } from "../src/cmd-runner.ts";
import { picoStaged } from "../src/index.ts";
import { createGit } from "../src/git.ts";
import type { PipelineTask } from "../src/types.ts";
import {
  appendFile,
  createStdout,
  fixture,
  makeDir,
  removeFile,
  writeFile,
} from "./utils/index.ts";

const cwd = fixture("simple/runner-e2e-test");
const srcDir = fixture("simple/runner-e2e-test/src/foo");

beforeEach(async () => {
  await removeFile(cwd);
  await makeDir(srcDir);
  await writeFile("a.js", "const a = 1;\n", srcDir);
  await writeFile("b.js", "const b = 1;\n", srcDir);
  await writeFile("b.css", "body { color: red; }\n", cwd);
});

afterEach(async () => {
  await removeFile(cwd);
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

test("cmd-runner executes tasks and handles --bail on failure", async () => {
  const runner = createCmdRunner({
    rootPath: srcDir,
    cwd: srcDir,
    files: ["a.js", "b.js"],
    config: {
      "a.js": () => "node -e \"console.error('fail a'); process.exit(1)\"",
      "b.js": () => 'node -e "setTimeout(() => {}, 10000)"',
    },
    bail: true,
  });

  const groups = await runner.generateCmdTasks();
  const parent: PipelineTask = {
    title: "Running tasks",
    tasks: groups,
    task: () => {},
  };

  const start = Date.now();
  await assert.rejects(() => runner.run(parent), /fail a/);
  assert.ok(Date.now() - start < 5000);
  assert.equal(groups[0]?.status, "fail");
  assert.equal(groups[1]?.status, "warn");
});

test("picoStaged runs end-to-end on a git repository with staged files", async () => {
  const git = createGit(cwd);
  await git.exec(["init"]);
  await git.exec(["config", "user.name", "test"]);
  await git.exec(["config", "user.email", "test@test.com"]);
  await appendFile("hello.js", "const x = 1;\n", cwd);
  await git.add(["hello.js"]);

  const stdout = createStdout();
  await picoStaged({
    cwd,
    stream: stdout,
    config: {
      "*.js": () => 'node -e "process.exit(0)"',
    },
  });

  assert.ok(stdout.out.includes("Running tasks for staged files"));
});
