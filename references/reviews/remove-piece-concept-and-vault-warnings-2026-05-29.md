# Review: Remove Piece concept + vault warnings inspector

**Date**: 2026-05-29
**Scope**: `packages/storage`, `packages/api`, `packages/frontend`, `packages/shared`
**Plan**: `references/plans/remove-piece-concept-and-vault-warnings.md`
**Spec**: `specifications/import-pipeline.md`, `specifications/project-config.md`

Commits reviewed: `dcbe157` (Part 1 — piece removal + full-frontmatter adoption), `85fac48` (Part 2 — vault warnings inspector).

---

## Overall

Solid, faithful to the plan. Both parts land as designed: the `pieces/` machinery is gone, raw `.md` drops get full canonical frontmatter on adoption, and the three warning kinds flow storage → API → frontend with live SSE updates. All warning test suites are green (storage 17, api 6, frontend 4 via vitest). No blocking bugs found. The notable gaps are all in **incremental** `UNKNOWN_ASPECT_KEY` upkeep — they are bounded by "rebuild stays authoritative" (an explicit plan decision), but a couple of the paths are more user-visible than the plan implies and deserve to be called out. The rest is standards nits.

---

## Bugs

None.

---

## Design

### 1. `UNKNOWN_ASPECT_KEY` only reconciles on fragment *sync* — not on aspect create/delete or fragment delete

`packages/storage/src/watcher/sync/fragment.ts:136-160` reconciles unknown-aspect-key warnings for keys a fragment touches, but three adjacent events do **not** reconcile:

- **Creating the missing aspect** goes through `syncKeyedEntity` (`watcher.ts` aspect route), which never touches the warnings table. So the user sees "unknown aspect key X", creates aspect X, and the warning persists until they next edit a fragment referencing X *or* a rebuild runs.
- **Deleting a fragment** (`unlinkFragment`, `fragment.ts:165-174`) deletes the row and emits, but does not reconcile. If the last fragment referencing an unknown key is deleted, the warning lingers; if some remain, the stored `fragmentUuids` payload keeps the deleted UUID until rebuild.

This is consistent with the plan (Phase 5 scoped reconciliation to `syncFragment`; "rebuild stays authoritative"). But the aspect-create case in particular is a plausible everyday flow — fix the thing the warning told you to fix, warning doesn't clear — so it's worth a deliberate decision rather than an accident of scope. Either reconcile in the aspect sync path (clear `UNKNOWN_ASPECT_KEY` for the newly-known key) or document the "clears on next fragment edit / rebuild" behavior in the spec and the tab's fix hint.

---

## Minor

### 2. Adoption recomputes the fragment, drifting `updatedAt` between disk and DB

`packages/storage/src/watcher/sync/fragment.ts:88` builds `adoptedFragment = fragmentMapper.fromFile(parsed, …)` (→ `updatedAt = new Date()` = T1), serializes it, and writes T1 to disk. Line 109 then calls `fromFile(parsed, …)` **again** for the DB upsert (→ `updatedAt = new Date()` = T2, milliseconds later). Result: disk has T1, DB stores T2. The hash-guard still no-ops correctly (it hashes `resolvedRawContent`, which is the T1 disk content), so this is cosmetic — but the DB sits a few ms ahead of disk until the next rebuild re-reads T1. Reuse `adoptedFragment` for the upsert instead of re-deriving `fragment`; it's also one fewer parse-map pass.

### 3. Warning writes happen outside the fragment upsert transaction

`fragment.ts:121-123` wraps `upsertFragment` in a transaction, but the surrounding `insertWarning` / `deleteStateWarningByKey` calls (collision at :74, reconciliation at :150-156) run on the bare `vaultDatabase`. A crash between the upsert commit and the warning write leaves the index and the warnings table momentarily inconsistent. Self-heals on rebuild, so low stakes — noting it because the atomicity boundary is non-obvious.

### 4. Standards: missing `if` braces and `=== 0` / `> 0` length checks

`references/CODING_STANDARDS.md` requires explicit braces on all `if` bodies and `!length` / `!!length` over `=== 0` / `> 0`. New code that drifts:

- `DiagnosticsTab.tsx:60` — `if (dismissWarning.isPending) return;` (no braces).
- `DiagnosticsTab.tsx:98` — `if (group.length === 0) return null;` (no braces **and** `=== 0`).
- `DiagnosticsTab.tsx:90` — `warnings.length === 0` (should be `!warnings.length`).
- `fragment.ts:160` — `if (warningsChanged) emit({ type: "vault:warning" });` (no braces).
- `fragment.ts:149` — `if (referencingUuids.length > 0)` (should be `!!referencingUuids.length`).

### 5. `WarningIdParamSchema.id` is `z.string()` while `projectId` is `z.uuid()`

`packages/api/src/schemas/warnings.ts:41-44` — warning ids are `randomUUID()`, so `z.uuid()` would be the tighter, more consistent contract. Harmless as-is.

### 6. Wrong-format warning re-fires on every `change`, not just `add`

`watcher.ts:227-254` runs the wrong-format branch for both `add` and `change` (shared `handleAddOrChange`). Editing an existing `.docx` re-upserts the same row (refreshing `createdAt`) and re-emits `vault:warning`. Functionally fine — just redundant churn on a file that's already flagged.

---

## Non-issues

- **Direct `mutateAsync` in `DiagnosticsTab` dismiss handler** — matches the existing config-tab pattern (`NotesTab`, `AspectsTab` both call `mutateAsync` directly) and is sanctioned by the plan. Per-item list actions are not palette-discoverable, so the command-system rule doesn't apply.
- **`NULL` `dedupKey` for event warnings** — intentional; SQLite treats NULLs as distinct in a unique index, so every `UUID_COLLISION` yields its own row while state warnings dedup on `(kind, dedupKey)`. Documented in the schema comment.
- **`insertWarning` `onConflictDoUpdate` resets `dismissedAt: null`** — only reachable for state warnings (event warnings never collide on the unique index), and state warnings can't be dismissed, so the reset is a no-op in practice.
- **`useWarnings(projectId)` called twice** (badge in `ProjectConfigPage/index.tsx`, list in `DiagnosticsTab`) — both hit the same `useListWarnings` query key; react-query dedupes.
- **`vault:warning` SSE carries no payload → broad project-scoped invalidation** — explicitly chosen in the plan; acceptable given warning churn is rare.
- **Adoption rewrite only fires for externally-dropped files without a UUID** — Maskor-created fragments already carry a UUID (`wasAssigned` false), so they skip the rewrite. No double-write.
- **Pre-existing `registry.test.ts:88` failure** — flagged in `references/suggestions.md` as failing on a clean checkout independent of this work; out of scope for this review.

---

## Resolution (2026-05-29)

Fixes applied after the review:

- **#1 fixed.** Extracted `reconcileUnknownAspectKeyWarnings` (`packages/storage/src/warnings/reconcile.ts`) and wired it into every path that shifts a key's known/referenced status: fragment sync (refactored), fragment unlink, and new optional `onSynced` / `onDeleted` hooks on `EntityConfig` that the aspect config uses (`watcher.ts`). Creating the missing aspect now clears the warning on the aspect sync; deleting an aspect re-creates it; deleting the last referencing fragment clears it. Three tests added to `warnings-watcher.test.ts` (all green).
- **#2 fixed.** Adoption now reuses the `adoptedFragment` it serialized to disk for the DB upsert (`fragment.ts`), so disk and DB share one `updatedAt`.
- **#4 fixed.** Brace/length-check standards corrected in `DiagnosticsTab.tsx` and `ProjectConfigPage/index.tsx`; the `fragment.ts` instances were removed by the #1 refactor.
- **#6 fixed.** Wrong-format recording now runs on `add` only; `change` is skipped (`watcher.ts`).
- **#3 deferred (intentional).** Making warning writes transactional with the entity upsert would require a tx-aware warnings layer, against the deliberate "warnings are a best-effort cache, rebuild authoritative" design. The inconsistency window is benign and self-heals on rebuild.
- **#5 deferred (intentional).** Tightening `WarningIdParamSchema.id` to `z.uuid()` would turn the "unknown id" case from a friendly 404 into a 400 validation error and break the existing `nonexistent` 404 test. The loose schema is the better contract.
