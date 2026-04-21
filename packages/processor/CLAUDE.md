# Processor Package — Coding Guide

Runtime: **Bun**.

## Package role

Intended to manage queues and convert `Piece` objects into `Fragment` objects.

**Current state**: stub. `src/index.ts` is empty.

> **TODO**: It's unclear whether this package is needed as a standalone service. The conversion logic may end up living directly in the API or triggered by a user action in the frontend. Revisit before implementing.

## Intended design (if it stays)

- Consumes `Piece` entries from the vault index (written by the importer or dropped in directly).
- Converts each `Piece` to a `Fragment` via `StorageService` from `@maskor/storage`.
- Would likely be triggered by watcher events (`pieces:consumed`) rather than polling.

## Key types

Import `Piece`, `Fragment`, `FragmentCreate` from `@maskor/shared`. Never re-declare domain types here.
