import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createGit } from "../src/git.ts";
import { createGitWorkflow } from "../src/git-workflow.ts";
import { appendFile, createTempDir, removeFile, writeFile } from "./utils/index.ts";

let cwd = "";

async function execGit(args: string[]): Promise<string> {
  const git = createGit(cwd);
  return git.exec(args, { cwd });
}

beforeEach(async () => {
  cwd = await createTempDir("pico-workflow-test-");
  await execGit(["init"]);
  await execGit(["config", "core.autocrlf", "false"]);
  await execGit(["config", "user.name", "test"]);
  await execGit(["config", "user.email", "test@test.com"]);
  await appendFile("README.md", "line1\nline2\n", cwd);
  await execGit(["add", "README.md"]);
  await execGit(["commit", "-m", "initial commit"]);
});

afterEach(async () => {
  await removeFile(cwd);
});

test("creates and cleans up original and unstaged patches", async () => {
  const workflow = createGitWorkflow({
    dotPath: resolve(cwd, ".git"),
    allowEmpty: false,
    rootPath: cwd,
  });

  await writeFile("README.md", "line1\nline2\nmodified\n", cwd);
  await workflow.backupOriginalState();
  assert.equal(workflow.hasPatch(workflow.patch.original), true);

  await workflow.backupUnstagedFiles([join(cwd, "README.md")]);
  assert.equal(workflow.hasPatch(workflow.patch.unstaged), true);

  await workflow.restoreOriginalState();
  assert.equal((await execGit(["diff", "--name-only", "HEAD"])).trim(), "README.md");

  await workflow.cleanUp();
  assert.equal(existsSync(workflow.patch.original), false);
  assert.equal(existsSync(workflow.patch.unstaged), false);
});

test("restores unstaged changes cleanly and throws on unresolvable conflict", async () => {
  const readmePath = join(cwd, "README.md");
  const workflow = createGitWorkflow({
    dotPath: resolve(cwd, ".git"),
    allowEmpty: false,
    rootPath: cwd,
  });

  await writeFile("README.md", "line1\nline2\nunstaged-addition\n", cwd);
  await workflow.backupUnstagedFiles([readmePath]);
  assert.equal(await readFile(readmePath, "utf8"), "line1\nline2\n");

  await workflow.restoreUnstagedFiles([readmePath]);
  assert.equal(await readFile(readmePath, "utf8"), "line1\nline2\nunstaged-addition\n");

  await writeFile(workflow.patch.unstaged, "invalid patch content\n");
  await assert.rejects(
    () => workflow.restoreUnstagedFiles([readmePath]),
    /Merge conflict!!! Unstaged changes not restored\./,
  );
});

test("applies modifications, handles allowEmpty, and supports unborn HEAD", async () => {
  const readmePath = join(cwd, "README.md");
  const strictWorkflow = createGitWorkflow({
    dotPath: resolve(cwd, ".git"),
    allowEmpty: false,
    rootPath: cwd,
  });

  await assert.rejects(
    () => strictWorkflow.applyModifications([readmePath]),
    /Prevented an empty git commit!/,
  );

  const emptyAllowedWorkflow = createGitWorkflow({
    dotPath: resolve(cwd, ".git"),
    allowEmpty: true,
    rootPath: cwd,
  });
  await emptyAllowedWorkflow.applyModifications([readmePath]);

  await writeFile("README.md", "line1\nchanged\n", cwd);
  await strictWorkflow.applyModifications([readmePath]);
  assert.equal((await execGit(["diff", "--name-only", "--staged"])).trim(), "README.md");

  const unbornDir = await createTempDir("pico-unborn-");
  try {
    const unbornGit = createGit(unbornDir);
    await unbornGit.exec(["init"]);
    await writeFile("new.txt", "hello\n", unbornDir);
    await unbornGit.add(["new.txt"]);

    const unbornWorkflow = createGitWorkflow({
      dotPath: resolve(unbornDir, ".git"),
      allowEmpty: false,
      rootPath: unbornDir,
    });
    await unbornWorkflow.applyModifications([join(unbornDir, "new.txt")]);
    assert.equal((await unbornGit.exec(["diff", "--name-only", "--cached"])).trim(), "new.txt");
  } finally {
    await removeFile(unbornDir);
  }
});
