# Remove the Piece concept; auto-adopt raw markdown; vault warnings inspector

**Date**: 28-05-2026
**Status**: In progress (Part 1 done; Part 2 pending)
**Specs**: `specifications/import-pipeline.md`, `references/dumps/storage-sync.md`, `specifications/_glossary.md`

---

## Goal

Remove the `pieces/` folder mechanism entirely. A raw markdown file dropped into `fragments/`
is already adopted as a fragment by the watcher (`syncFragment` → `ensureUuid`); this plan makes
that the *only* adoption path, deletes the redundant `pieces/` staging machinery, and strengthens
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
- [ ] Add a `references/SUGGESTIONS.md` entry only if a genuine surprise surfaces during implementation.

> Phase 3 docs may ship in the same PR as Phase 2 if preferred.

---

## Part 2 — Vault warnings inspector

Surfaces three warning kinds to the user. Two are **state warnings** (re-detectable on rebuild,
clear when fixed): `WRONG_FORMAT_FILE`, `UNKNOWN_ASPECT_KEY`. One is an **event warning**
(auto-resolved, persists until dismissed, never re-derived on rebuild): `UUID_COLLISION`.

### Phase 4 — Warnings store (storage / DB)

- [ ] New `vault_warnings` table (migration under `packages/storage/src/db/vault/migrations/`): `id`, `kind` (`WRONG_FORMAT_FILE | UNKNOWN_ASPECT_KEY | UUID_COLLISION`), `category` (`state | event`), `payload` (JSON: `filePath`, `aspectKey`, `fragmentUuids`, `collidingPath`, `newUuid`, etc.), `createdAt`, `dismissedAt` (nullable).
- [ ] Extend the `SyncWarning` union (`packages/storage/src/indexer/types.ts`) with the two new kinds.
- [ ] Warnings repo module: `insertWarning`, `listWarnings` (exclude dismissed), `deleteStateWarnings(kinds)`, `deleteStateWarningByKey(...)`, `dismissWarning(id)`.
- [ ] Rebuild integration (`indexer`): at the start of a rebuild, `DELETE` all **state** rows; then re-detect:
  - `WRONG_FORMAT_FILE` — scan entity folders for non-`.md`, non-dotfile files → insert one row each.
  - `UNKNOWN_ASPECT_KEY` — the warnings already returned by `upsertFragment` get inserted (currently only logged).
  - **Preserve** `UUID_COLLISION` (event) rows — rebuild must not wipe them.
- [ ] Tests: rebuild clears+rebuilds state warnings, preserves event warnings; dismissed rows excluded from list.

### Phase 5 — Incremental warning updates in the watcher

- [ ] `syncFragment`: on a resolved UUID collision (`fragment.ts:57–71`), insert a `UUID_COLLISION` event warning (`collidingPath`, `newUuid`). On unknown aspect key, upsert a `UNKNOWN_ASPECT_KEY` state warning (de-duplicated per key); on a clean re-sync, remove it.
- [ ] `watcher.ts`: make the `if (!absolutePath.endsWith(".md")) return;` guard (line 234) **route-aware** — a non-`.md`, non-dotfile file added under an entity folder records a `WRONG_FORMAT_FILE` state warning instead of being silently dropped; its unlink removes the warning.
- [ ] New SSE event `vault:warning` added to `VaultSyncEvent` + `VAULT_SYNC_EVENT_TYPES`; emitted after warning-table changes.
- [ ] Tests: dropping a `.docx` in `fragments/` records a warning + emits `vault:warning`; removing it clears the warning; collision records an event warning.

### Phase 6 — API endpoints + codegen

- [ ] `GET /projects/:projectId/warnings` → list of current (non-dismissed) warnings.
- [ ] `POST /projects/:projectId/warnings/:id/dismiss` → dismiss an **event** warning; reject/no-op for state warnings (they clear by fixing the cause).
- [ ] OpenAPI annotations; `bun run codegen` in `packages/frontend`.
- [ ] Wire `vault:warning` through the SSE route/`useVaultEvents` plumbing.
- [ ] Integration tests: list, dismiss event warning, dismiss-state-warning rejected, missing project.

### Phase 7 — Frontend warnings inspector

- [ ] New `DiagnosticsTab.tsx` under `packages/frontend/src/pages/ProjectConfigPage/tabs/` (sibling to General/Aspects/Notes/References).
- [ ] `useWarnings` hook (orval-generated query), invalidated by `useVaultEvents` on `vault:warning`.
- [ ] Render grouped by kind, each row showing context (file path / aspect key / colliding path) and a short fix hint. Event warnings (`UUID_COLLISION`) get a Dismiss button; state warnings do not.
- [ ] Optional: a count badge on the config nav. Sidepanel surface deferred.
- [ ] Tests: renders warnings, dismiss button only on event warnings, live update on `vault:warning`.

---

## Out of scope / deferred

- Auto-converting non-`.md` files dropped into `fragments/` (conversion stays in the import pipeline).
- Renaming the importer's internal `Piece`/`RawPiece`/`PreviewPiece`/`pieceIndex`/`pieceKey` terminology — importer-local, optional future cleanup now that the glossary discourages "piece".
- A dedicated warnings sidepanel (config-page tab only for now).
- Migrating `UUID_COLLISION` to the action log instead of the warnings table.
