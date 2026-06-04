# Dev-only DB auto-reset on schema mismatch

**Date**: 01-06-2026
**Status**: Done
**Specs**: `specifications/storage-sync.md`
**Closed**: 01-06-2026

---

## Goal

When the developer changes a DB schema and restarts the API in dev, the vault DB (and registry DB) is automatically dropped, recreated at the current schema, and repopulated from the vault — with no manual `delete db` + restart juggling. Triggered only when an opt-in dev flag is set and the live DB's schema fingerprint no longer matches the code's. Off by default; never fires in a normal/packaged run.

---

## Background

`createVaultDatabase` (`packages/storage/src/db/vault/index.ts`) runs Drizzle `migrate()` on every open. `migrate()` only applies migration files it has not already recorded by hash — it cannot reconcile a schema edited without a fresh migration, an amended already-applied migration, or a half-failed hand-written SQLite migration. The escape hatch today is manual: delete `vault.db`, restart (clean `migrate()`), reload.

This is cheap and safe **because the vault DB is a derived cache** — `index.rebuild` re-derives fragments, aspects, notes, references, and sequences from vault files, and is already wired into the startup path in `resolveProject`.

**Caveat that forces dev-only gating:** the invariant is not fully true. `fragment_stats` (`schema.ts:109`) holds behavioral telemetry — `voluntaryOpenCount`, `promptAcceptCount`, `avoidanceCount`, `editCount`, `lastSurfacedAt` — that is canonical DB-only state, not stored in any vault file and not reconstructed by rebuild. `UUID_COLLISION` event warnings are likewise never re-derived. A normal `index.rebuild` preserves both (stats row upsert is `onConflictDoNothing`); a full DB reset destroys both. Acceptable in greenfield/solo dev, unacceptable in a real project — hence the reset must be opt-in dev-only, never automatic in production.

The registry DB (`packages/storage/src/db/registry/index.ts`) has the identical `migrate()`-on-open structure and the same drift problem, so it gets parallel treatment. (Note: nuking the registry DB drops the project registry; for dev this is acceptable but should be called out in the reset log line.)

---

## Tasks

### Phase 0: Branch

- [x] Create branch `dev-db-auto-reset` from current base

### Phase 1: Schema fingerprint + reset primitive (vault DB)

- [x] Decide the dev flag: env var `MASKOR_DB_AUTO_RESET` (truthy = enabled). Read once; document it.
- [x] Add a schema-fingerprint helper: hash of the migration journal (`migrations/meta/_journal.json` entries) — stable per schema version, changes whenever migrations change.
- [x] On `createVaultDatabase`: read the stored fingerprint from `PRAGMA user_version` (or a small meta mechanism if a 32-bit int proves insufficient — prefer `user_version` for zero schema cost).
- [x] If flag is set AND a DB file exists AND stored fingerprint ≠ current fingerprint: close any live handle, delete `vault.db`, recreate, run `migrate()`, then stamp the new fingerprint into `user_version`. Reuse the existing `closeRawVaultDatabase` teardown path rather than inventing a new one.
- [x] If flag is unset: behave exactly as today (`migrate()` only) — no fingerprint check side effects beyond optionally stamping `user_version` on a fresh DB.
- [x] Always stamp `user_version` after a successful `migrate()` on a freshly created DB so the next run has a baseline.
- [x] Emit a single clear log line on reset (which DB, old→new fingerprint, "telemetry/stats and dismissed collision warnings discarded").

### Phase 2: Registry DB parity

- [x] Apply the same flag-gated fingerprint-check + reset to `createRegistryDatabase`.
- [x] Log line notes that the project registry is discarded on registry reset.

### Phase 3: Repopulation wiring (verify, don't duplicate)

- [x] Confirm the existing startup rebuild in `resolveProject` repopulates a freshly reset vault DB on first project access — no new rebuild trigger should be needed. Add a test asserting this.
- [x] Confirm nothing caches a stale drizzle wrapper / indexer / watcher across a reset (mirror the draft-restore teardown reasoning). Document any cache that must be dropped.

### Phase 4: Spec + suggestions correction

- [x] Update `specifications/storage-sync.md`: qualify the "DB fully re-derivable" invariant — `fragment_stats` behavioral counters and `UUID_COLLISION` event warnings are canonical DB-only state, not reconstructed by rebuild. Add the dev-only auto-reset to the `Shipped` section once implemented.
- [x] Add a `references/suggestions.md` entry recording the spec-vs-code drift found during investigation (invariant overstated).

### Phase 5: Commit

- [x] `bun run format` then `bun run verify`; fix issues.
- [x] `git commit` the batch with a descriptive message.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Fingerprint mismatch + flag set → DB file is recreated and repopulated; row counts match the vault.
- Fingerprint mismatch + flag unset → no reset; behaves as today.
- Matching fingerprint + flag set → no reset (idempotent restart).
- Fresh DB (no file) → created, migrated, fingerprint stamped, no spurious reset.
- A reset followed by startup rebuild yields fragment/aspect/note/reference/sequence counts matching the vault.

---

## Notes

Open decisions to confirm before implementing:

- Flag mechanism: env var `MASKOR_DB_AUTO_RESET` (recommended — explicit, can't fire in a packaged build) vs. tying to a not-yet-existing `NODE_ENV`/`MASKOR_ENV` distinction. Plan assumes the env var.
- Fingerprint source: migration-journal hash (recommended) vs. hashing generated DDL. Journal hash is cheapest and changes exactly when migrations change.
- Storage of fingerprint: `PRAGMA user_version` (recommended, zero schema cost) — only revisit if a 32-bit int is insufficient.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. ALSO update the relevant frontmatter of the relevant specs — add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
