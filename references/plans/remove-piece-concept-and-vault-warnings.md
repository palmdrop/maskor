# Remove the Piece concept; auto-adopt raw markdown; vault warnings inspector

**Date**: 28-05-2026
**Status**: Done (Part 1 + Part 2 complete)
**Specs**: `specifications/import-pipeline.md`, `references/dumps/storage-sync.md`, `specifications/_glossary.md`

---

## Goal

Remove the `pieces/` folder mechanism entirely. A raw markdown file dropped into `fragments/`
is already adopted as a fragment by the watcher (`syncFragment` → `ensureUuid`); this plan makes
that the _only_ adoption path, deletes the redundant `pieces/` staging machinery, and strengthens
adoption so a freshly-dropped file gets a complete canonical frontmatter written back.

Wrong-format files (non-`.md`) are never auto-converted — conversion stays in the import pipeline.
Instead they, along with two existing log-only warning kinds, are recorded in a new vault-warnings
store the user can inspect on the project config page.

The work splits into two independently-shippable parts:

- **Part 1 (Phases 1–3)** — Piece removal + full-frontmatter adoption. Self-contained; each phase ships alone.
- **Part 2 (Phases 4–7)** — User-facing vault warnings inspector. Builds on Part 1; does not block it.

---

## Key findings (context for implementers)

- There are **three** distinct "Piece" notions. Only the first two are touched:
  1. `@maskor/shared` `Piece = {key, content}` (`packages/shared/src/schemas/domain/piece.ts`) — used **only** by `initFragment`, used **only** by `vault.pieces.consume`/`consumeAll`. **DELETE.**
  2. The `pieces/` folder + `vault.pieces.*` + `syncPieces` + `PIECE_PREFIX` route + `PIECE_CONSUME_FAILED` + `pieces:consumed` event + skeleton dir. **DELETE.**
  3. `@maskor/importer` `Piece`/`RawPiece` (locally defined, `packages/importer/src/index.ts:9`) — the in-memory split-result of the real import pipeline. **KEEP** (importer's own local type, per scope decision).
- The import command (`packages/api/src/commands/fragments/import.ts`) does **not** touch the `pieces/` folder or the shared `Piece` type — it splits in-memory and calls `createFragmentCommand` directly. Removing the folder does not affect import.
- Raw-`.md`-drop adoption **already works**: `syncFragment` (`fragment.ts:19`) → `ensureUuid` mints + writes back a UUID; `fragmentMapper.fromFile` derives key from filename and defaults the rest. This is the documented external-edit contract in `storage-sync.md` ("File created outside Maskor: UUID assigned + written back if missing"). The `pieces/` path is redundant.
- `ensureUuid` (`packages/storage/src/watcher/utils/uuid.ts`) is **generic** across fragment/aspect/note/reference. Full-frontmatter writeback must be fragment-specific — do not change `ensureUuid`.

---

## Part 1 — Remove Piece, strengthen fragment adoption

### Phase 1 — Full-frontmatter writeback on fragment adoption

Ships first so the enhanced adoption is in place before the redundant path is removed.

- [x] In `syncFragment` (`packages/storage/src/watcher/sync/fragment.ts`): when a fragment file has **no uuid** in frontmatter (the `wasAssigned` branch), write back the **complete canonical frontmatter** — `uuid`, `updatedAt`, `readiness`, `notes`, `references` — preserving any fields the user already supplied, rather than the current UUID-only writeback.
- [x] Implementation approach: parse → `fragmentMapper.fromFile` (applies read-time defaults) → assign new uuid → serialize via `fragmentMapper.toFile` + `serializeFile`, then `Bun.write`. This reuses the canonical serializer and supersedes the uuid-only path **for fragments only**. Leave `ensureUuid` untouched for aspect/note/reference sync.
- [x] Files that already carry a uuid are left on disk untouched (only DB upsert proceeds) — no normalization churn on every external edit.
- [x] Recompute `contentHash` on the rewritten content so the hash-guard is correct and the follow-up watcher event no-ops.
- [x] Tests:
  - Drop a raw `.md` (body only, no frontmatter) into `fragments/` → adopted; full frontmatter written back; uuid minted; key derived from filename; indexed; `fragment:synced` emitted.
  - Drop a `.md` with partial frontmatter (e.g. `readiness: 0.5`, no uuid) → `readiness` preserved, uuid added, `notes`/`references`/`updatedAt` filled.
  - Drop a `.md` that already has a uuid → file untouched on disk; DB upsert only.

### Phase 2 — Delete the `pieces/` folder machinery

- [x] `packages/storage/src/vault/markdown/vault.ts`: remove `pieces: { consume, consumeAll }`, `toAbsolutePiece`, and the `initFragment` import.
- [x] `packages/storage/src/vault/markdown/init.ts`: delete `initFragment` (only consumer was `pieces`). Delete `packages/storage/src/__tests__/init.test.ts` (or the relevant cases).
- [x] `packages/storage/src/watcher/sync/pieces.ts`: delete.
- [x] `packages/storage/src/watcher/watcher.ts`: remove the `PIECE_PREFIX` route and the `syncPieces` import.
- [x] `packages/storage/src/watcher/utils/constants.ts`: remove `PIECE_PREFIX`.
- [x] `packages/storage/src/vault/types.ts`: remove `pieces` from the `Vault` type and remove `PIECE_CONSUME_FAILED` from `VaultErrorCode` (confirm unused elsewhere first).
- [x] `packages/storage/src/service/storage-service.ts`: remove `pieces.consumeAll` (lines ~1406–1410).
- [x] `packages/storage/src/utils/vault-skeleton.ts`: remove `"pieces"` from `VAULT_SKELETON_DIRS`. Do **not** delete an existing `pieces/` dir from on-disk vaults (leave user data alone; it simply stops being routed).
- [x] `packages/storage/src/drafts/constants.ts`: remove `"pieces"` from both dir lists (lines 13, 33).
- [x] `packages/shared/src/schemas/domain/piece.ts`: delete. Remove its re-export in `packages/shared/src/schemas/domain/index.ts`.
- [x] `packages/shared/src/events.ts`: remove `pieces:consumed` from `VaultSyncEvent` and `VAULT_SYNC_EVENT_TYPES`.
- [x] `packages/frontend/src/hooks/useVaultEvents.ts`: remove the `"pieces:consumed"` handling.
- [ ] Regenerate frontend types if the events/schema flow requires it (`bun run codegen` from `packages/frontend`).
- [x] Update/remove piece references in tests: `vault.test.ts`, `storage-service.test.ts`, `registry.test.ts`.
- [x] Behavior note to verify: a `.md` file now sitting in a leftover `pieces/` folder no longer matches any watcher route → silently ignored (orphaned). Acceptable for greenfield; document in the spec.

### Phase 3 — Spec + docs cleanup

- [x] `specifications/_glossary.md` — already updated this session (Piece removed, **Warning** added, dual-sense ambiguity dropped). No further action unless Part 2 naming changes.
- [x] `specifications/import-pipeline.md`: remove the `pieces/` drop-zone out-of-scope line; rewrite the "Piece transience" section and the "Piece is transient" prior decision to reflect that import creates fragments directly and raw `.md` dropped into `fragments/` is auto-adopted with full frontmatter written back. Update `Shipped`.
- [x] `references/dumps/storage-sync.md`: mark open question #7 (`pieces/` single-file routing) moot — resolved by removal. Strengthen the external-edit rule: "File created outside Maskor → for fragments, full default frontmatter written back" (not just UUID).
- [x] Add a `references/suggestions.md` entry only if a genuine surprise surfaces during implementation.

> Phase 3 docs may ship in the same PR as Phase 2 if preferred.

---

## Part 2 — Vault warnings inspector

Surfaces three warning kinds to the user. Two are **state warnings** (re-detectable on rebuild,
clear when fixed): `WRONG_FORMAT_FILE`, `UNKNOWN_ASPECT_KEY`. One is an **event warning**
(auto-resolved, persists until dismissed, never re-derived on rebuild): `UUID_COLLISION`.

### Phase 4 — Warnings store (storage / DB)

- [x] New `vault_warnings` table (migration under `packages/storage/src/db/vault/migrations/`): `id`, `kind` (`WRONG_FORMAT_FILE | UNKNOWN_ASPECT_KEY | UUID_COLLISION`), `category` (`state | event`), `dedupKey` (per-key dedup for state warnings; NULL for event), `payload` (JSON `SyncWarning`), `createdAt`, `dismissedAt` (nullable). Unique index on `(kind, dedupKey)`.
- [x] Extend the `SyncWarning` union (`packages/storage/src/indexer/types.ts`) with the two new kinds (`WRONG_FORMAT_FILE`, `UUID_COLLISION`). Added `UnknownAspectKeyWarning = Extract<…>` so `upsertFragment` / `RebuildStats.warnings` stay narrowed and the existing rebuild API schema is unaffected.
- [x] Warnings repo module (`packages/storage/src/warnings/warnings-repo.ts`): `insertWarning`, `listWarnings` (exclude dismissed), `deleteStateWarnings(kinds)`, `deleteStateWarningByKey(...)`, `dismissWarning(id)` (returns `dismissed | not_found | not_event`).
- [x] Rebuild integration (`indexer`): after the entity transaction, `deleteStateWarnings(STATE_WARNING_KINDS)`; then re-detect:
  - `WRONG_FORMAT_FILE` — `detectWrongFormatFiles` (`warnings/wrong-format.ts`) scans entity folders for non-`.md`, non-dotfile files → insert one row each (vault-root-relative path).
  - `UNKNOWN_ASPECT_KEY` — warnings returned by `upsertFragment`, aggregated per key (merging fragmentUuids), inserted.
  - **Preserve** `UUID_COLLISION` (event) rows — only state kinds are deleted.
- [x] Tests (`packages/storage/src/__tests__/warnings.test.ts`): repo insert/list/dedup/dismiss/delete; rebuild clears+rebuilds state warnings, preserves event warnings, dedups unknown-aspect; dismissed rows excluded.

### Phase 5 — Incremental warning updates in the watcher

- [x] `syncFragment`: on a resolved UUID collision, insert a `UUID_COLLISION` event warning (vault-relative `filePath` + `collidingPath`, `newUuid`) and emit `vault:warning`. After upsert, reconcile `UNKNOWN_ASPECT_KEY` state warnings across every aspect key the fragment touched (previous ∪ new): unknown+referenced → upsert (with current referencing UUIDs); known or unreferenced → clear. Emits `vault:warning` on any change. Rebuild stays authoritative.
- [x] `watcher.ts`: the non-`.md` guard in both `handleAddOrChange`/`handleUnlink` is **route-aware** — a non-`.md` file under an entity folder records (add) / clears (unlink) a `WRONG_FORMAT_FILE` state warning and emits `vault:warning`. Chokidar already filters dotfiles via its `ignored` regex.
- [x] New SSE event `vault:warning` (no payload) added to `VaultSyncEvent` + `VAULT_SYNC_EVENT_TYPES`; emitted after warning-table changes.
- [x] Tests (`packages/storage/src/__tests__/warnings-watcher.test.ts`): `.docx` drop records warning + emits `vault:warning`; removal clears it; collision records an event warning; unknown aspect key recorded then cleared on clean re-sync.

### Phase 6 — API endpoints + codegen

- [x] `GET /projects/:projectId/warnings` → list of current (non-dismissed) warnings (`packages/api/src/routes/warnings.ts`). Storage exposes `warnings.list` / `warnings.dismiss`; repo functions re-exported from `@maskor/storage`.
- [x] `POST /projects/:projectId/warnings/{id}/dismiss` → dismisses an **event** warning (200 + remaining list); state warning → 400; unknown id → 404. Goes through `dismissWarningCommand` (no action-log entry, like swap) per the commands convention.
- [x] OpenAPI annotations (`schemas/warnings.ts`, discriminated-union `VaultWarning`); `bun run codegen` ran against a temporarily-started API → generated `useListWarnings` / `useDismissWarning` + `VaultWarning` union model.
- [x] `vault:warning` SSE: the SSE route (`routes/events.ts`) streams all `VaultSyncEvent` types generically, so no route change was needed; `useVaultEvents` handling lands in Phase 7.
- [x] Integration tests (`packages/api/src/__tests__/routes/warnings.test.ts`): list empty, list state warning after rebuild, missing project 404; dismiss event warning 200, dismiss-state-warning 400, unknown id 404.

### Phase 7 — Frontend warnings inspector

- [x] New `DiagnosticsTab.tsx` under `packages/frontend/src/pages/ProjectConfigPage/tabs/` (sibling to General/Aspects/Notes/References); registered in `ProjectConfigPage/index.tsx` and the `diagnostics` tab added to `validTabs` in `router.ts`.
- [x] `useWarnings` hook (`src/hooks/useWarnings.ts`, wraps orval `useListWarnings`), live-invalidated by `useVaultEvents` — `vault:warning` added to its event-type list (broad project-scoped invalidation).
- [x] Renders grouped by kind, each row showing context (file path / aspect key + fragment count / colliding path) and a short fix hint. `UUID_COLLISION` (event) rows get a Dismiss button; state warnings do not. Dismiss goes through `useDismissWarning` directly (per-item list action, consistent with existing config-tab mutations).
- [x] Count badge on the Diagnostics tab trigger.
- [x] Tests (`tabs/__tests__/DiagnosticsTab.test.tsx`): healthy empty state, renders grouped warnings with context, Dismiss only on event warnings, dismiss calls mutation with the warning id.

---

## Out of scope / deferred

- Auto-converting non-`.md` files dropped into `fragments/` (conversion stays in the import pipeline).
- Renaming the importer's internal `Piece`/`RawPiece`/`PreviewPiece`/`pieceIndex`/`pieceKey` terminology — importer-local, optional future cleanup now that the glossary discourages "piece".
- A dedicated warnings sidepanel (config-page tab only for now).
- Migrating `UUID_COLLISION` to the action log instead of the warnings table.
