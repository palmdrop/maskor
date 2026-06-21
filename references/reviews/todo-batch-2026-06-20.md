# Review: TODO batch (split polish, unsaved-dot, ref quick-add, add-to-sequence, sticky label, dev DB reset)

**Date**: 2026-06-20
**Scope**: `packages/{api,frontend,importer,storage}`, branch `agent/todos` vs `main`
**Spec**: `fragment-split.md`, `storage-sync.md`, `references.md`, `sequencer.md`, `preview.md`, `import-pipeline.md`

---

## Overall

Clean batch. Every item maps to a TODO line and a spec Shipped entry; `bun run verify` is green (842 frontend tests, backend + OpenAPI snapshot in-sync). No correctness bugs found — the data-loss-sensitive path (split) preserves the existing "truncate original last" ordering and the new `pieceKeys` override path is validated for shape + case-insensitive uniqueness against existing keys and earlier pieces. Findings are limited to one staleness gap in the unsaved-dot, a repeated full-parse in the new delimiter detector, and some minor style drift from `CODING_STANDARDS.md`. The split dialog's bogus "Split failed" fix (decoupling invalidations from the mutation try block) is correct and the right shape.

---

## Bugs

None.

---

## Design

### 1. Unsaved-changes dot is not reactive to edits in the current view

`packages/frontend/src/hooks/useUnsavedFragmentUuids.ts:10` — the dot is driven by `useListSwaps` with `refetchOnWindowFocus: true` and nothing else. Swap files are written on a debounce as the user types and cleared on save, but neither event invalidates `getListSwaps`. Consequences inside a single session (no blur/focus):

```
edit fragment → swap written server-side → list query stale → no dot until refocus
save fragment → swap cleared server-side → list query stale → dot lingers (shows "unsaved" when saved)
```

The lingering-after-save case is the more surprising one (false "dirty"). The summary frames the dot as a best-effort hint and explicitly accepts a lingering-swap false positive, so this is acceptable as shipped — but worth noting that in practice the indicator is only accurate at mount and on window focus, not live. If it ever needs to feel live, invalidate `getListSwaps` from the live-save success path (and on swap write). On the `FragmentListPage` the editor is mounted in the same view's `Outlet`, so this is the common path, not an edge.

---

## Minor

### 2. `detectSplitDelimiter` re-parses the body up to 7 times per call

`packages/importer/src/index.ts:114` — the loop calls `splitMarkdown(content, level, …)` for each of the 6 heading levels, and each call runs a full `fromMarkdown(content)` parse; then `splitThematicBreak` parses once more. The preview endpoint fires this on dialog open (and, per the two-preview-on-open flow, effectively twice). It's an in-memory, infrequent endpoint so this is not urgent, but the body is parsed once and the heading depths are already in the tree — a single `fromMarkdown` with a min-depth scan + a thematic-break presence check would replace all 7 parses. Optional.

### 3. `SplitKeyConflictError` also carries malformed-key (non-conflict) errors

`packages/api/src/commands/fragments/split-fragment.ts:56` — `resolveOverrideKey` wraps both `validateEntityKey` format failures and uniqueness collisions in `SplitKeyConflictError`, so a malformed override surfaces as HTTP 400 `SPLIT_KEY_CONFLICT`. The dialog validates format in-modal first (`ENTITY_KEY_REGEX`) so the server rarely sees a malformed key, and the frontend only re-displays the server message when it matches `/key/i` — which both messages do — so it renders fine either way. Cosmetic: the error code conflates "bad shape" with "name taken."

### 4. Style drift from `CODING_STANDARDS.md` in new code

- Braceless non-return `if` bodies (standard: explicit braces on `if` bodies, with bare early-`return` the only exception):
  - `packages/api/src/commands/fragments/split-fragment.ts:117` — `if (override.pieceIndex >= 2) overrideKeyByPieceIndex.set(...)`
  - `packages/frontend/src/components/fragments/SplitFragmentDialog.tsx:143` — `if (applied.type === "heading") setHeadingLevel(...)`
- Length checks against `0` (standard: prefer `!!` / `!`):
  - `SplitFragmentDialog.tsx:171` — `if (key.length === 0)` → `if (!key.length)`
  - `SplitFragmentDialog.tsx:209` — `pieceKeys.length > 0 ? …` → `!!pieceKeys.length`

All match patterns already present elsewhere in the tree and none are lint-enforced (verify is green), so low priority — but they are new lines against a documented standard.

### 5. `listSwaps` route param schema is hand-rolled

`packages/api/src/routes/swap.ts:22` — `request: { params: z.object({ projectId: z.uuid() }) }` inline, where the sibling swap routes use the shared `SwapParamSchema` and the rest of the API uses `projectIdParamSchema` (`schemas/shared`). Harmless (the list route has no entity params) but inconsistent with the shared-schema convention.

---

## Non-issues

- **Override keys validated only against non-discarded fragments** (`split-fragment.ts:88`) — `existingKeys` filters out discarded summaries, so an override could match a discarded fragment's key and only fail at vault-write time. This is consistent with `deriveKey`/`preview-split`, which filter discarded the same way, so the whole split path treats discarded keys uniformly; not a regression.
- **Split dialog fires two previews on open** (`SplitFragmentDialog.tsx:113`) — auto-detect (no delimiter) → adopt `appliedDelimiter` → re-preview. Idempotent against the in-memory endpoint, guarded by a `cancelled` flag, and documented in-code.
- **Add-to-sequence placement is best-effort, not atomic** (`FragmentListPage.tsx:140`) — a created-but-unplaced fragment is possible; the fragment is created regardless and a placement failure surfaces a toast. Intentional per spec.
- **Dev DB auto-reset now ON by default in `dev`** (`packages/api/package.json`) — every new migration triggers a full drop+rebuild on next restart, wiping `fragment_stats` telemetry. Greenfield-acceptable and documented in `.env.example` + `references/suggestions.md`; `start` never sets it.
- **`PreviewToolbar` children relocated to the right rail** (`PreviewToolbar.tsx`) — the active-fragment label moved from an in-flow slot to the `ml-auto` group beside Export, replacing the prior `{children ?? <div>{children}</div>}` no-op expression. Deliberate layout change, not a regression.
