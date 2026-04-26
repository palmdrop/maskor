# Plan: Logging and Error Management

**Date**: 2024-04-04
**Status**: Done

Scope: add structured logging via `pino` to `@maskor/shared`, refactor `VaultError` to an `Error` subclass with structured context, wire logging into `packages/storage`.

---

## 1. Install dependencies in `@maskor/shared`

`pino.transport()` uses `worker_threads` internally and has known compatibility issues in Bun (unable to resolve transport target at runtime). We avoid it entirely.

```
bun add pino rotating-file-stream --cwd packages/shared
bun add -D pino-pretty @types/pino --cwd packages/shared
```

- `pino` — core logger, JSON to stdout + file via `pino.multistream()` (no workers)
- `rotating-file-stream` — plain Node stream for log rotation, no transport/worker needed
- `pino-pretty` — dev-only CLI pipe, not used as a transport

---

## 2. Logger module — `packages/shared/src/logger/`

### `packages/shared/src/logger/index.ts`

```ts
export type LoggerConfig = {
  service: string;  // e.g. "storage", "api"
  logDir?: string;  // if provided, also write JSON to <logDir>/maskor.log
  level?: string;   // default: "info"
};

export const createLogger = (config: LoggerConfig): pino.Logger
```

**Implementation:**

- Always write JSON to `process.stdout`
- If `logDir` is provided, also write JSON to a `rotating-file-stream` pointed at `<logDir>/maskor.log`
- Both streams combined via `pino.multistream([...])`
- No `pino.transport()` — no worker threads

```ts
import pino from "pino";
import { createStream } from "rotating-file-stream";
import { mkdirSync } from "node:fs";

export const createLogger = ({ service, logDir, level = "info" }: LoggerConfig) => {
  const streams: pino.StreamEntry[] = [{ stream: process.stdout }];

  if (logDir) {
    mkdirSync(logDir, { recursive: true });
    const fileStream = createStream("maskor.log", {
      path: logDir,
      interval: "1d", // rotate daily
      maxFiles: 14, // keep 14 days
    });
    streams.push({ stream: fileStream });
  }

  return pino({ level, base: { service } }, pino.multistream(streams));
};
```

**Pretty-printing in dev** — add a pipe to dev scripts in each package's `package.json`:

```json
"dev": "bun run src/index.ts | pino-pretty"
```

Raw JSON is logged at all times. The pipe is opt-in per run.

**Child loggers:** Each subsystem calls `logger.child({ module: "vault" })` to attach more context.

### Export from shared

Add `export * from "./logger"` to `packages/shared/src/index.ts`.

---

## 3. Refactor `VaultError` — `packages/storage/src/backend/types.ts`

Replace the plain object with an `Error` subclass that carries structured context. Every error must answer: what file, what entity, and why.

```ts
export type VaultErrorCode =
  | "FILE_NOT_FOUND"
  | "FILE_ALREADY_EXISTS"
  | "FILE_DELETE_FAILED"
  | "FILE_MOVE_FAILED"
  | "FRAGMENT_NOT_FOUND"
  | "PIECE_CONSUME_FAILED";

export type VaultErrorContext = {
  filePath?: string; // absolute path of the file involved
  uuid?: string; // entity UUID if known
  reason?: string; // human-readable explanation of why it failed
};

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly context: VaultErrorContext;

  constructor(
    code: VaultErrorCode,
    message: string,
    context: VaultErrorContext = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VaultError";
    this.code = code;
    this.context = context;
  }
}
```

Update all `throw` sites in `vault.ts` and `init.ts` to pass context:

```ts
throw new VaultError("FILE_NOT_FOUND", `File not found: "${filePath}"`, {
  filePath,
  reason: "File does not exist or was deleted before read",
});

throw new VaultError("FRAGMENT_NOT_FOUND", `Cannot discard: fragment "${uuid}" not found`, {
  uuid,
  reason: "UUID not present in any file under fragments/",
});

throw new VaultError(
  "FILE_ALREADY_EXISTS",
  `Cannot initialize fragment: file already exists at "${dest}"`,
  { filePath: dest, reason: "A fragment with this title already exists in fragments/" },
);
```

---

## 4. Wire logger into `packages/storage`

`createVault(config)` accepts an optional `logger`:

```ts
export type VaultConfig = {
  root: string;
  logger?: pino.Logger; // if omitted, all logging is a no-op (useful in tests)
};
```

Inside `vault.ts`, bind a child logger at construction time:

```ts
const log = config.logger?.child({ module: "vault" }) ?? pino({ level: "silent" });
```

### Log call conventions

Every log call must include the file path and/or UUID when available. Use the structured object form — never interpolate into the message string.

```ts
// correct — context is structured and filterable
log.warn(
  { filePath, frontmatterPool: parsed.frontmatter.pool },
  "pool/folder conflict: overriding to discarded",
);

// incorrect — context is buried in a string
log.warn(
  `Fragment at "${filePath}" is in discarded/ but pool="${parsed.frontmatter.pool}". Overriding.`,
);
```

### Log sites in `vault.ts`

| Location                                       | Level   | Fields                                | Message                                                                                              |
| ---------------------------------------------- | ------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `read` — pool/folder conflict (folder wins)    | `warn`  | `filePath`, `frontmatterPool`         | `"pool/folder conflict: fragment in discarded/ but frontmatter pool is not discarded — overriding"`  |
| `read` — pool/folder conflict (folder ignored) | `warn`  | `filePath`, `frontmatterPool`         | `"pool/folder conflict: fragment has pool=discarded but is not in discarded/ — pool not overridden"` |
| `discard` — success                            | `info`  | `uuid`, `filePath`, `destination`     | `"fragment discarded"`                                                                               |
| `discard` — uuid not found                     | `error` | `uuid`                                | `"cannot discard: fragment not found"` (then throw)                                                  |
| `write` — success                              | `debug` | `filePath`                            | `"fragment written"`                                                                                 |
| `consumeAll` — piece consumed                  | `info`  | `filePath`, `fragmentTitle`           | `"piece consumed"`                                                                                   |
| `consumeAll` — piece failed                    | `error` | `filePath`, `err.code`, `err.message` | `"failed to consume piece — skipping"`                                                               |
| `init` — file already exists                   | `error` | `filePath`                            | `"cannot initialize fragment: file already exists"` (then throw)                                     |

Same pattern applies to `aspects`, `notes`, and `references` when relevant.

**Tests:** pass no logger so the pino silent fallback keeps test output clean.

---

## 5. Usage example (storage entry point, future)

```ts
import { createLogger } from "@maskor/shared";
import { createVault } from "@maskor/storage";

const logger = createLogger({
  service: "storage",
  logDir: `${vaultRoot}/logs`, // vault/logs/ during development
  level: process.env.LOG_LEVEL ?? "info",
});

const vault = createVault({ root: vaultRoot, logger });
```

Changing log location later = change `logDir`. No other code changes needed.

---

## 6. File structure

```
packages/shared/src/
  logger/
    index.ts       # createLogger factory
  index.ts         # add export * from "./logger"

packages/storage/src/
  backend/
    types.ts       # VaultError class + VaultErrorCode + VaultErrorContext
    markdown/
      vault.ts     # replace console.warn with log.warn/info/error
      init.ts      # replace throw plain object with VaultError
```

---

## Implementation order

1. Install `pino` + `pino-roll` in `@maskor/shared`
2. Write `logger/index.ts` + export from shared
3. Refactor `VaultError` to `Error` subclass with context
4. Update `vault.ts` and `init.ts` — replace throw sites and console calls
5. Update `vault.test.ts` to omit logger (silent fallback)

## What is NOT in scope

- Per-request / per-operation correlation IDs — future concern
- Logging in other packages (`api`, `importer`, etc.) — same pattern applies, deferred
