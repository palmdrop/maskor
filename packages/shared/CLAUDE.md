# Shared Package — Coding Guide

Runtime: **Bun**. Imported by all other packages — no runtime side effects, no service dependencies.

## Package role

Single source of truth for domain types, Zod schemas, events, logger, and utilities shared across the monorepo.

## Exports (always import from `@maskor/shared`, never deep-import)

| Path                  | What's there                                                    |
| --------------------- | --------------------------------------------------------------- |
| `src/schemas/domain/` | Zod schemas + inferred types for all domain entities            |
| `src/types/utils/`    | Branded/utility types without a Zod schema (`UUID`, `Markdown`) |
| `src/events.ts`       | `VaultSyncEvent` union + `VAULT_SYNC_EVENT_TYPES` array         |
| `src/logger/`         | Shared logger instance                                          |
| `src/utils/`          | Pure utilities (`slugify`)                                      |

## Schema vs. type split

- **`src/schemas/domain/`** — the default home. Define a Zod schema, export it and the inferred type from the same file. This is where `Fragment`, `Aspect`, `Note`, `Piece`, etc. live.
- **`src/types/utils/`** — only for types that have no Zod schema and are utility/branded types (e.g. `UUID`, `Markdown`). Do not add domain types here.
- If a domain type needs a complementary type (e.g. a `FragmentCreate` input shape), add it to the same `schemas/domain/<entity>.ts` file, not a separate types file.

## Adding a new domain entity

1. Create `src/schemas/domain/<entity>.ts` — define schema, export schema + inferred type.
2. Re-export from `src/schemas/domain/index.ts`.
3. Run `bun run typecheck` to verify nothing breaks.

## VaultSyncEvent

`VaultSyncEvent` in `src/events.ts` is the canonical list of events emitted by the watcher (via SSE). `VAULT_SYNC_EVENT_TYPES` is a compile-time guard — if you add a variant to the union, TypeScript will error until you also add it to the array.
