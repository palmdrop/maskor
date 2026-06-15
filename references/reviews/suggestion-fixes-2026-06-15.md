# Review: Fragment createdAt + suggestion-driven fixes

**Date**: 2026-06-15
**Scope**: `packages/storage`, `packages/api`, `packages/frontend`, `references/suggestions.md`, `tasks/`
**Plan**: `references/plans/fragment-created-at.md`
**Spec**: `specifications/fragment-model.md`

---

## Overall

The branch bundles one feature (durable fragment `createdAt` + a "Created at" sort) and a batch of suggestion-driven cleanups (per-row actions through the command system, two-stage Escape in TagCombobox, flat-theme radii, two PRD clarifications). The `createdAt` feature is complete and matches its plan: frontmatter-first sourcing with a birthtime bootstrap confined to the adoption write-back, threaded through index → API → frontend, well covered by tests. Storage (437) and frontend (833) suites pass.

The one real problem in the suggestions bookkeeping (the explicit point of the branch): a resolved suggestion was **not** removed — the 2026-06-11 `createdAt` entry was still present despite the feature shipping. Corrected as part of this review (Bug #1). A second concern (the "Per-item list actions" prune left ArcEditor's inline save unmigrated) was investigated and dismissed — that save is an exempt inline form-submit, so the prune was correct; see Non-issues.

---

## Bugs

### 1. Resolved `createdAt` suggestion still present in `references/suggestions.md`

`references/suggestions.md:5` — the 2026-06-11 "Fragments have no `createdAt`" suggestion is still in the file, even though the feature shipped this branch (commit `2f3f163`). The plan's Phase 6 task ("Remove the (already-deleted) `createdAt` line … if it has been re-added") is checked `[x]`, but the line was never actually removed — it exists identically on `main` and `HEAD`, so it was never deleted in the first place. The "(already-deleted)" premise in the plan was wrong.

Fix: remove the line. Done as part of this review.

---

## Design

None.

---

## Minor

### 2. Migration default `created_at = 0` would surface as epoch on a non-reset DB

`packages/storage/src/db/vault/migrations/20260615_add_fragment_created_at.sql:1` — `ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0` backfills any pre-existing rows to 1970-01-01. In practice the schema-fingerprint auto-reset re-derives the index from markdown on next rebuild (noted in the plan), and there are no live users, so this never surfaces. Worth a mental note only if migrations are ever applied in-place without a fingerprint reset.

---

## Non-issues

- **Reader (`vault.ts`) not modified to pass birthtime** — intentional per the plan's implementation refinement: birthtime is statted once inside `writeBackFragmentFrontmatter` (the shared adoption path), keeping `fromFile` IO-free. Normal reads of an already-adopted fragment fall back `createdAt → updatedAt`, which is the documented chain.
- **`rounded-[min(var(--radius-md),10px)]` left in `button.tsx` / `select.tsx`** — these reference the theme radius variable (collapse to 0 under the flat `--radius: 0rem`), so they honor the theme. Only the genuinely hardcoded `rounded-[4px]` (checkbox) and `rounded-[2px]` (tooltip) were offenders; both fixed.
- **Row buttons pass the full fragment to `commands.run("fragment-list:delete", fragment)`** — the full `IndexedFragment` is structurally assignable to `FragmentListItem { uuid, key }`; the direct-arg dispatch bypasses the palette picker as designed.
- **`deleteFragmentAction` confirms inside the primitive** — deliberate, so the palette path is guarded too (noted in the code comment).
- **vaultPath suggestion removed** — genuinely resolved: the frontend now has a folder-picker flow (`RegisterProjectDialog`, `folder-kind.ts`, `useFsList`) that supplies the path.
- **Empty-piece and sequence-name-case suggestions removed** — resolved by deliberate PRD amendments (`3b130fc`); both decisions are now documented in `tasks/prd-import-pipeline-stage-1.md` and `tasks/prd-secondary-sequences.md` respectively, matching the existing implementation.
- **"Create command palette entries open dialogs" suggestion removed** — resolved: `project-shell` scope's `create:*` commands call `openCreate(kind)` (covered by `scope-smoke.test.ts`).
- **`ArcEditor` "Save arc" still calls `putArc.mutateAsync` directly** (`ArcEditor.tsx:97`) — exempt. It is an inline form-submit committing transient per-editor draft points, the same category as its `AspectsTab` siblings (`AspectKeyInput` rename on blur/Enter, aspect create in a `<Dialog>`, aspect delete via `ConfirmDialog`) — none of which route through the command system. It cannot be palette-discoverable (the palette can't supply live draft points) and N editors mount at once, so a per-aspect singleton scope is impossible. Decided exempt on 2026-06-15; the "Per-item list actions" prune was therefore correct. Errors are already surfaced in-place via `setError`, matching the in-place-error pattern.
