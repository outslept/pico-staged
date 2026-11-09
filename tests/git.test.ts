import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createGit } from "../src/git.ts";
import { appendFile, createTempDir, removeFile, writeFile } from "./utils/index.ts";

let cwd = "";
let patchPath = "";

async function execGit(args: string[]): Promise<void> {
  const git = createGit(cwd);
  await git.exec(args, { cwd });
}

beforeEach(async () => {
  cwd = await createTempDir("pico-git-test-");
  patchPath = join(cwd, "pico-staged.patch");
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

test("returns empty paths when git directory is not found", async () => {
  const git = createGit(cwd);
  const paths = await git.getGitPaths({ cwd: "Z:\\non-existent-path-pico" });
  assert.deepEqual(paths, { root: "", dot: "" });
});

test("resolves root and .git directory paths", async () => {
  const git = createGit(cwd);
  const paths = await git.getGitPaths();
  assert.equal(paths.root.toLowerCase(), cwd.toLowerCase());
  assert.equal(paths.dot.toLowerCase(), join(cwd, ".git").toLowerCase());
});

test("creates diff patch file and applies it", async () => {
  const git = createGit(cwd);
  await writeFile("README.md", "# Test\n## Test", cwd);
  await git.diff(patchPath);

  const patch = await readFile(patchPath, "utf8");
  assert.ok(patch.includes("+## Test"));

  await git.checkout(["README.md"]);
  await git.apply(patchPath);
  assert.equal((await stat(patchPath)).isFile(), true);
});

test("adds, checks out, and parses porcelain status", async () => {
  const git = createGit(cwd);
  await appendFile("a.js", "let a = {};", cwd);
  await appendFile("b.js", "let b = {};", cwd);
  await git.add(["b.js"]);

  const entries = await git.status();
  assert.deepEqual(entries, [
    { x: "A", y: " ", path: "b.js" },
    { x: "?", y: "?", path: "a.js" },
  ]);

  await writeFile("b.js", "let b = 2;", cwd);
  await git.checkout([join(cwd, "b.js")]);
  const afterCheckout = await git.status();
  assert.deepEqual(afterCheckout, [
    { x: "A", y: " ", path: "b.js" },
    { x: "?", y: "?", path: "a.js" },
  ]);
});

test("categorizes staged, unstaged, and changed files", async () => {
  const git = createGit(cwd);
  await writeFile("README.md", "# Test\n## Staged\n", cwd);
  await git.add(["README.md"]);
  await writeFile("README.md", "# Test\n## Staged\n## Unstaged\n", cwd);

  const staged = await git.stagedFiles();
  assert.deepEqual(staged, {
    working: ["README.md"],
    deleted: [],
    changed: ["README.md"],
  });

  const unstaged = await git.unstagedFiles();
  assert.deepEqual(unstaged, {
    working: ["README.md"],
    deleted: [],
    changed: ["README.md"],
  });

  await execGit(["commit", "-m", "second commit"]);
  const changed = await git.changedFiles(["HEAD", "HEAD~1"]);
  assert.deepEqual(changed, {
    working: ["README.md"],
    deleted: [],
    changed: [],
  });
});

test("handles git worktrees", async () => {
  const git = createGit(cwd);
  const workTreeDir = resolve(cwd, "worktree");

  await execGit(["branch", "test-wt"]);
  await execGit(["worktree", "add", workTreeDir, "test-wt"]);

  const paths = await git.getGitPaths({ cwd: workTreeDir });
  assert.equal(paths.root.toLowerCase(), workTreeDir.toLowerCase());
  assert.equal(
    paths.dot.toLowerCase(),
    join(cwd, ".git", "worktrees", "worktree").toLowerCase(),
  );
});
