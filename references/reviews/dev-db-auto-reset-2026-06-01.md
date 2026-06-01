# Review: Dev-only DB auto-reset on schema drift

**Date**: 2026-06-01
**Scope**: `packages/storage/src/db/schema-fingerprint.ts`, `packages/storage/src/db/vault/index.ts`, `packages/storage/src/db/registry/index.ts`
**Plan**: `references/plans/dev-db-auto-reset.md`
**Spec**: `specifications/storage-sync.md`

---

## Overall

Clean, well-commented, well-tested implementation that matches the plan's structure and ships the spec/suggestions corrections it promised. The gating is correct (opt-in env flag, fresh-DB-only stamping, no-op on matching fingerprint), and all phases are accounted for. One real design gap stands out: the chosen fingerprint source — the migration **journal** — does not detect two of the three drift scenarios the plan's own Background cites as motivation, because `_journal.json` carries no SQL content. The rest are minor: a misleading registry log line, no registry-side tests, and a couple of unhandled edges.

---

## Design

### 1. Journal-hash fingerprint misses in-place migration amendments — two of the three motivating drift cases

`packages/storage/src/db/schema-fingerprint.ts:31` — `computeSchemaFingerprint` hashes `meta/_journal.json`. That file records only `idx`, `version`, `when`, `tag`, `breakpoints` per migration — **no SQL content hash**. So the fingerprint changes when a migration is added, removed, or regenerated, but not when an existing `.sql` file's body is edited in place.

The plan Background lists the cases `migrate()` can't reconcile and that this feature is meant to rescue:

> "a schema edited without a fresh migration, **an amended already-applied migration**, or a half-failed hand-written SQLite migration"

Map them to journal behavior:

```
edit schema.ts, no migration generated   → journal unchanged → NOT detected
amend an already-applied .sql in place    → journal unchanged → NOT detected
add / regenerate / delete a migration     → journal changes   → detected ✓
```

The Notes section asserts the journal hash "changes exactly when migrations change" — that justification is inaccurate for in-place amendments, which are exactly the messy hand-edits the escape hatch exists for. The feature fires reliably only on the "added a new migration" path, where `migrate()` would usually have reached the right schema anyway (and the reset is the _destructive_ option, discarding `fragment_stats`).

Fix: hash the concatenated migration `.sql` file contents (or drizzle's per-file hashes), not just the journal. That catches in-place amendments and still changes on add/remove. Costs a few extra small file reads at open time — negligible. If the journal-only scope is intentional, the plan/spec wording should be narrowed to "detects migration-set changes" and stop claiming it covers amended migrations.

---

## Minor

### 2. Registry reset log line claims "re-derived from the vault" — false for the registry

`packages/storage/src/db/schema-fingerprint.ts:80` — the trailing clause is shared across both DBs:

```
... Resetting <path> (discarding the project registry); re-derived from the vault on next rebuild.
```

The project registry is **not** vault-derived and is not rebuilt — it's lost until projects re-register. The `discarded` phrase is correctly branched per label; the "re-derived from the vault on next rebuild" tail should be branched too (or dropped for the registry). As written it contradicts the plan's Phase 2 intent to clearly call out the registry loss.

### 3. No tests for the registry reset path

`packages/storage/src/__tests__/schema-fingerprint.test.ts` — Phase 2 added flag-gated reset to `createRegistryDatabase`, but every test exercises only the vault DB. The reset/stamp logic is shared, but the registry wiring (separate migrations folder, separate fingerprint, fresh-stamp branch) is untested. At minimum assert: registry fresh-DB stamping, and drift + flag → reset.

### 4. Pre-feature DBs always reset on the first flag-on run

`packages/storage/src/db/schema-fingerprint.ts:65` — any DB created before this feature has `user_version = 0`. On the first run with the flag set, `stored (0) !== current` → reset fires, discarding `fragment_stats`, even when the schema actually matches. Acceptable in greenfield/solo dev (the flag is opt-in), but it's a one-time silent data loss worth a sentence in the plan/spec so it isn't mistaken for a drift detection.

### 5. Corrupt/locked DB file makes startup throw instead of falling back

`packages/storage/src/db/schema-fingerprint.ts:43` — `readStoredFingerprint` opens `new Database(path, { readonly: true })`. If the file exists but isn't a valid SQLite DB (the "half-failed migration" case the Background mentions can leave a mangled file), this throws and crashes open _before_ the reset that would have fixed it. Given the dev-reset intent, a malformed file is arguably the strongest reset signal — consider treating a read failure as drift (reset) rather than letting it propagate.

### 6. Reset deletes files directly instead of reusing `closeRawVaultDatabase` as the plan specified

`packages/storage/src/db/schema-fingerprint.ts:53` — Phase 1 said "close any live handle ... Reuse the existing `closeRawVaultDatabase` teardown path rather than inventing a new one." The implementation instead `rmSync`s the files (+ `-wal`/`-shm`) without closing any cached handle. This is safe today because `getVaultDatabase` caches one connection per project and the reset only fires on the first open of a process (verified: `storage-service.ts:172`), so no live handle exists when it runs — but it's a deviation from the plan's stated teardown reuse, and it silently assumes that caching invariant. The `resetDatabaseIfSchemaDrifted` comment documents the cross-restart-only reasoning, which mitigates it. Worth a one-line note that it deliberately does not go through `closeRawVaultDatabase`.

---

## Non-issues

- **Reads `process.env` on every `createDatabase` call, not "once" as the plan said** — correct call. Per-call reads are what make the tests work (they toggle the flag between calls) and the cost is nil. The plan's "read once" was the weaker suggestion.
- **31-bit mask on a signed hash** (`schema-fingerprint.ts:25,29`) — `| 0` yields a signed 32-bit int, `& 0x7fffffff` maps it into the positive range `PRAGMA user_version` requires. Correct; the test pins `> 0` and `<= 0x7fffffff`.
- **WAL/SHM sidecar deletion** (`schema-fingerprint.ts:53`) — deleting `-wal`/`-shm` alongside the main file is the right move; leaving them would corrupt the recreated DB.
- **Stale `rawDatabaseByVaultPath` entry after a reset** — not reachable: the reset only runs on the first `createVaultDatabase` of a process (per-project cache upstream), when the map is still empty for that path.
- **Separate fingerprints for vault vs registry** — each computes against its own `migrationsFolder`, so the two DBs drift independently. Correct.
