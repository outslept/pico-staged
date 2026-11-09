import {
  appendFile as fsAppendFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

const DIRNAME = dirname(fileURLToPath(import.meta.url));

export async function createTempDir(prefix = "pico-staged-"): Promise<string> {
  const raw = await mkdtemp(join(tmpdir(), prefix));
  return realpathSync(raw);
}

export async function appendFile(
  filename: string,
  content: string,
  dir: string = process.cwd(),
): Promise<void> {
  await fsAppendFile(resolve(dir, filename), content, "utf8");
}

export async function makeDir(dir: string = process.cwd()): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function writeFile(
  filename: string,
  content: string,
  dir: string = process.cwd(),
): Promise<void> {
  await fsWriteFile(resolve(dir, filename), content, "utf8");
}

export async function removeFile(dir: string): Promise<void> {
  if (dir) {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

export function fixture(name: string): string {
  return resolve(DIRNAME, "../fixtures", name);
}

export interface MockStream extends Writable {
  out: string;
}

export function createStdout(): MockStream {
  let out = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      out += chunk.toString();
      callback();
    },
  }) as MockStream;

  Object.defineProperty(stream, "out", {
    get: () => out,
    set: (val: string) => {
      out = val;
    },
  });

  return stream;
}
