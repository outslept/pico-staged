import process from "node:process";
import { styleText } from "node:util";
import { PicoStagedError, TaskRunnerError } from "./errors.ts";

export interface Reporter {
  error: (err: unknown) => void;
}

export function createReporter(stream: NodeJS.WritableStream = process.stderr): Reporter {
  const highlight = (str: string): string =>
    str
      .split("*")
      .map((part, idx) => (idx % 2 !== 0 ? styleText("yellow", part) : part))
      .join("");

  return {
    error(err: unknown): void {
      if (err instanceof PicoStagedError) {
        const isInfo = err.type === "noFiles" || err.type === "noMatchingFiles";
        const prefix = isInfo ? styleText("cyan", "-") : styleText("red", "×");
        stream.write(`${prefix} ${highlight(err.message)}\n`);
        return;
      }

      if (err instanceof TaskRunnerError) {
        stream.write(`\n${err.message}\n`);
        return;
      }

      if (err instanceof Error) {
        stream.write(`${err.stack ?? err.message}\n`);
      } else {
        stream.write(`${String(err)}\n`);
      }
    },
  };
}
