import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { executor } from "../src/executor.ts";

test("executor resolves stdout output on exit code 0", async () => {
  const out = await executor(process.execPath, ["-e", 'process.stdout.write("hello pico")']);
  assert.equal(out, "hello pico");
});

test("executor pipes input to child stdin", async () => {
  const out = await executor(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], {
    input: "stdin payload",
  });
  assert.equal(out, "stdin payload");
});

test("executor merges custom env without mutating global process.env.PATH", async () => {
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const before = process.env[pathKey];
  const out = await executor(
    process.execPath,
    ["-e", 'process.stdout.write(process.env.PICO_CUSTOM ?? "")'],
    { env: { PICO_CUSTOM: "ok" } },
  );
  assert.equal(out, "ok");
  assert.equal(process.env[pathKey], before);
});

test("executor rejects with Error containing stderr on non-zero exit", async () => {
  await assert.rejects(
    () => executor(process.execPath, ["-e", 'process.stderr.write("boom error"); process.exit(1)']),
    (err: unknown) => err instanceof Error && err.message.includes("boom error"),
  );
});

test("executor rejects with exit code message when process exits non-zero silently", async () => {
  await assert.rejects(
    () => executor(process.execPath, ["-e", "process.exit(2)"]),
    /Process exited with code 2/,
  );
});

test("executor rejects when executable cannot be spawned", async () => {
  await assert.rejects(() => executor("non-existent-pico-binary-xyz"));
});

test("executor supports AbortSignal cancellation without timers", async () => {
  const controller = new AbortController();
  const promise = executor(process.execPath, ["-e", "process.stdin.resume()"], {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(promise);
});
