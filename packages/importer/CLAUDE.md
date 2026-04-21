# Importer Package — Coding Guide

Runtime: **Bun**.

## Package role

Imports writing from external formats (Word, PDF, plain text) and converts them into `Piece` objects written directly to the Obsidian vault. This is the entry point for raw content before it enters the fragment pipeline.

**Current state**: stub. `src/index.ts` is empty.

## Intended design

- **Not a long-running service** (for now) — invoked on demand (CLI or called from the API).
- Reads a source file, parses/splits its content, and writes one or more `Piece` files to the vault via `StorageService` from `@maskor/storage`.
- The watcher in `@maskor/storage` picks up the new pieces and updates the index automatically — the importer does not need to notify anything.
- A `Piece` has no UUID or full metadata; it is a temporary intermediary. The processor (or user action) converts it to a `Fragment`.

## Piece → Fragment flow

```
External file → importer → Piece in vault → watcher syncs index → processor converts → Fragment
```

## Key types

Import `Piece` from `@maskor/shared`. Never re-declare domain types here.
