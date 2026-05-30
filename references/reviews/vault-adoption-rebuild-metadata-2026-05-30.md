# Review: Vault adoption — rebuild mints missing metadata + eager Maskor dirs

**Date**: 2026-05-30
**Scope**: `packages/storage/src/vault/markdown/adopt.ts`, `vault/markdown/vault.ts`, `watcher/sync/fragment.ts`, `watcher/sync/keyed-entity.ts`, `utils/vault-skeleton.ts`
**Plan**: `references/plans/vault-adoption-rebuild-metadata.md`
**Spec**: `specifications/storage-sync.md`, `specifications/project-management.md`, `specifications/fragment-model.md`

---

## Overall

The implementation matches the plan precisely and the goal is met: adopting a metadata-less vault now mints + writes back UUIDs during the initial rebuild (full canonical frontmatter for fragments, UUID-only for keyed entities), the eager `.maskor/sequences|config` dirs and ENOENT-quiet listers remove the noisy errors, and a second rebuild is byte-identical. The Phase 2 refactor is a faithful extraction — the watcher's `ensureUuid`/`assignNewUuid`/fragment-writeback logic moved into the neutral `vault/markdown/adopt.ts` with no behavior change (only the dropped `watcher:` log prefix, now correct since shared). Tests are meaningful and use real no-UUID fixtures, closing the gap the `entity-subfolders` Phase 5 test masked. The affected suites (70 tests) pass. No correctness bugs found.

---

## Bugs

None.

---

## Design

### 1. `readAllWithFilePaths` is now a side-effecting "read"

`vault/markdown/vault.ts:147` (`readAdoptedKeyedEntities`) and `:182` (fragments) — these methods now mint UUIDs and `Bun.write` files back to disk as a side effect of a method named `read…`. The mutation is intentional and documented in the JSDoc, and it is contained: `readAllWithFilePaths` has exactly one caller (`indexer.rebuild`), while the pure `readAll` used by API routes is untouched. So no live hazard. The risk is latent — a future caller reaching for `readAllWithFilePaths` expecting a pure read would silently rewrite vault files. Worth keeping the adoption write-back behind a name that signals it (or asserting the rebuild-only contract) if a second caller ever appears.

---

## Minor

### 2. Double disk write per adopted fragment

`vault/markdown/vault.ts:191-203` and `watcher/sync/fragment.ts:47-92` — on fragment adoption, `ensureUuid` writes UUID-only frontmatter to disk, then `writeBackFragmentFrontmatter` immediately overwrites the same file with full canonical frontmatter. Two `Bun.write`s for every freshly-adopted fragment. This mirrors the pre-existing watcher behavior (now shared, so not a regression), but the rebuild path adopts in bulk — a large Obsidian vault pays `2N` writes for `N` fragments on first adopt. Correct and idempotent; just wasteful. Could be tightened by having the fragment path skip `ensureUuid`'s write when a full canonical write-back follows.

### 3. Branch history bundles an unrelated docs sync

The branch's first commit (`4de730d`) reconciles the pieces-removal / vault-warnings specs (a different plan) alongside planning this work, so `git diff main` surfaces warnings-store and `pieces/` spec churn unrelated to adoption. Harmless documentation catch-up, but it widens the diff and muddies the changeset's scope.

---

## Non-issues

- **Dropped `watcher:` log prefix** in `ensureUuid`/`assignNewUuid` — correct now that the helpers are shared between watcher and rebuild; a watcher-specific prefix would be misleading from the indexer.
- **Rebuild write-backs outside `withVaultWriteLock`** — confirmed safe per `packages/storage/CLAUDE.md`: the startup rebuild runs in `resolveProject` before any user write, and the restore-time rebuild runs inside `drafts.restore`, which already holds the lock. Documented at `storage-sync.md`.
- **Parallel `Bun.write` inside `Promise.all`** — each entity writes a distinct path; no file is touched twice concurrently.
- **`wasAssigned: false` fragments left with partial frontmatter on disk** — a fragment that already has a UUID but lacks other canonical fields is not rewritten; the DB still gets correct read-time defaults via `fromFile`. Matches the watcher and the "files with a UUID are left untouched" decision.
- **First-rebuild fragments take sync-time `updatedAt`** — consistent with the documented storage-sync resolution; idempotence holds because the second pass sees the now-present UUID and skips write-back.
- **Sequences excluded from adoption** — Maskor-owned, always written with a UUID; correctly left out of the adoption path.
- **ENOENT swallowed silently in `scanFiles`** — intended; absence of an entity/`.maskor` dir is normal during adoption. Other errors (permissions) still log. Verified by the `vault.test.ts` spy-logger suite.

---

## Resolution (2026-05-30)

- **#1 (design)** — fixed. Adoption is now opt-in via `readAllWithFilePaths({ adopt })` (`ReadAllOptions` in `vault/types.ts`), default `false` = pure read. Only `indexer.rebuild` passes `{ adopt: true }` (sequences read without it). Removes the silent-write-from-a-read trap. New `vault.test.ts` "adopt gating" cases lock the contract.
- **#2 (minor)** — fixed. `ensureUuid` gained a `writeBack` option; the fragment adoption path (both rebuild and watcher) mints the UUID in memory and writes once via `writeBackFragmentFrontmatter`, eliminating the intermediate UUID-only write.
- **#3 (minor)** — not actioned. Splitting commit `4de730d` needs a history rewrite on a branch that's effectively ready to merge; not worth the churn.
- **New finding (data-loss risk, pre-existing)** — surfaced while testing the fix: `parseFile` returns gray-matter's cached, shared-mutable `.data`, and the adoption helpers mutate `frontmatter.uuid` in place, so two byte-identical files share one frontmatter object. Adopting a vault with duplicate-content keyed entities can silently collapse them onto one UUID. Out of this branch's scope (predates it); logged in `references/suggestions.md` with a one-line fix (`{ ...matter(rawFile).data }`) for separate discussion.

Full `bun run verify` green (typecheck + 743 backend + 422 frontend).
