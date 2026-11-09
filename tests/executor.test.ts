import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { executor } from "../src/executor.ts";

test("executor resolves stdout output on exit code 0", async () => {
  const out = await executor("node", ["-e", 'process.stdout.write("hello pico")']);
  assert.equal(out, "hello pico");
});

test("executor rejects with Error containing stderr on non-zero exit", async () => {
  await assert.rejects(
    () => executor("node", ["-e", 'process.stderr.write("boom error"); process.exit(1)']),
    (err: unknown) => err instanceof Error && err.message.includes("boom error"),
  );
});

test("executor does not mutate global process.env.PATH", async () => {
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const before = process.env[pathKey];
  await executor("node", ["-e", "process.exit(0)"]);
  const after = process.env[pathKey];
  assert.equal(after, before);
});

test("executor supports AbortSignal cancellation", async () => {
  const controller = new AbortController();
  const promise = executor("node", ["-e", "setTimeout(() => {}, 10000)"], {
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(promise);
});
