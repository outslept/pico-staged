import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
  await execGit(["config", "user.name", "test"]);
  await execGit(["config", "user.email", "test@test.com"]);
  await appendFile("README.md", "# Test\n", cwd);
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

  await writeFile("README.md", "# Test\n# Modified\n", cwd);
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

test("applies modifications and prevents empty commits unless allowed", async () => {
  const workflow = createGitWorkflow({
    dotPath: resolve(cwd, ".git"),
    allowEmpty: false,
    rootPath: cwd,
  });

  await assert.rejects(
    () => workflow.applyModifications([join(cwd, "README.md")]),
    /Prevented an empty git commit!/,
  );

  await writeFile("README.md", "# Test\n# Changed\n", cwd);
  await workflow.applyModifications([join(cwd, "README.md")]);
  assert.equal((await execGit(["diff", "--name-only", "--staged"])).trim(), "README.md");
});
