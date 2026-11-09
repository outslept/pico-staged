# pico-staged

> Tiny, zero-dependency runner for linters and formatters on Git staged files.

## Usage

### CLI

Run `pico-staged` directly or inside your `pre-commit` Git hook:

```sh
npx pico-staged
```

```text
Usage: pico-staged [options]

Options:
  -c, --config <path>      Path to configuration file
  --diff [ref1] [ref2]     Run tasks for files changed between refs
  -u, --unstaged           Run tasks for unstaged files
  --allow-empty            Allow empty git commits when tasks revert all staged changes
  --bail                   Stop executing tasks on first error
  --quiet                  Disable console output from pico-staged
  -v, --version            Output the version number
  -h, --help               Display help for command
```

#### CLI Examples

```sh
# Run tasks on staged files (default)
pico-staged

# Run tasks on unstaged working tree files
pico-staged --unstaged

# Run tasks on files changed between two Git refs
pico-staged --diff main HEAD

# Abort remaining tasks immediately on the first failure
pico-staged --bail

# Use a custom config path
pico-staged --config ./config/pico-staged.mjs
```

## Configuration

`pico-staged` automatically searches upward from the current working directory for the first matching configuration source:

1. `.pico-staged.js` / `pico-staged.js`
2. `.pico-staged.mjs` / `pico-staged.mjs`
3. `.pico-staged.cjs` / `pico-staged.cjs`
4. `.pico-staged.json` / `pico-staged.json`
5. `.picostagedrc` (JSON)
6. `package.json` (`"pico-staged"` field)

### `package.json`

```json
{
  "pico-staged": {
    "*.{js,ts}": ["oxfmt", "oxlint --fix"],
    "*.{json,md}": "oxfmt"
  }
}
```

### Type-Safe JS Config (`pico-staged.mjs`)

Use `defineConfig` for full IDE autocompletion and type checking:

```js
import { defineConfig } from "pico-staged";

export default defineConfig({
  "src/**/*.ts": ["oxfmt", "oxlint --type-aware --type-check --fix"],
  "*.{json,md,yml}": "oxfmt",
});
```

### Dynamic Function Tasks

When a task is defined as a function, `pico-staged` passes `{ filenames, type }` Instead of automatically appending filenames to the command string, giving you full control over arguments (useful for whole-project typechecks or custom batching):

```js
import { defineConfig } from "pico-staged";

export default defineConfig({
  "src/**/*.ts": ({ filenames }) => [`oxfmt ${filenames.join(" ")}`, "tsc --noEmit"],
});
```

You can also export a single top-level function to handle all matched files (`*`):

```js
import { defineConfig } from "pico-staged";

export default defineConfig(async ({ filenames, type }) => {
  return [`oxlint ${filenames.join(" ")}`];
});
```

## Glob Matching

- **Basename patterns** (without `/`, e.g. `*.ts` or `*.{js,ts}`) match files at any directory depth.
- **Path patterns** (containing `/`, e.g. `src/**/*.ts` or `packages/*/src/*.ts`) match relative to the current working directory.
- **Extended globs**:
  - `!(pattern)` — match anything except `pattern`
  - `@(a|b)` — match exactly one of the patterns
  - `+(a|b)` — match one or more occurrences
  - `*(a|b)` — match zero or more occurrences
  - `?(a|b)` — match zero or one occurrence

## Programmatic API

```ts
import { picoStaged } from "pico-staged";

await picoStaged({
  cwd: process.cwd(),
  allowEmpty: false,
  bail: true,
  quiet: false,
  unstaged: false,
  diff: false,
  config: {
    "*.ts": ["oxfmt", "oxlint --fix"],
  },
});
```

### Options (`PicoStagedOptions`)

| Option       | Type                            | Default          | Description                                               |
| :----------- | :------------------------------ | :--------------- | :-------------------------------------------------------- |
| `cwd`        | `string`                        | `process.cwd()`  | Working directory to resolve files and config from.       |
| `config`     | `string \| PicoStagedConfig`    | `undefined`      | Explicit config object, function, or path to config file. |
| `allowEmpty` | `boolean`                       | `false`          | Allow empty commits when tasks revert all staged changes. |
| `bail`       | `boolean`                       | `false`          | Abort all running tasks on the first failure.             |
| `unstaged`   | `boolean`                       | `false`          | Run tasks on unstaged files instead of staged files.      |
| `diff`       | `boolean \| string \| string[]` | `false`          | Run tasks on files changed in `git diff`.                 |
| `quiet`      | `boolean`                       | `false`          | Suppress all terminal output.                             |
| `stream`     | `NodeJS.WritableStream`         | `process.stderr` | Output stream for the renderer and error reporter.        |
