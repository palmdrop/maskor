# Prose Editor Backend Adapters

**Date**: 10-06-2026
**Status**: Todo
**Specs**: none (frontend infrastructure; relates to `references/adr/0009-buffer-clean-anchoring-and-editor-driven-flow-alignment.md`)

---

## Goal

> The two editor backends behind `ProseEditorHandle` — CodeMirror (vim + raw) and TipTap (rich) — are expressed as two adapter modules, each independently satisfying the handle interface, so the imperative handle collapses from twelve per-method `vimMode || rawMarkdownMode ? … : …` branches to a single adapter selection. "Done" = each adapter is unit-testable against `ProseEditorHandle` in isolation, the inline branching is gone, and editor behavior (vim, raw, rich) is unchanged.

---

## Context

From the architecture review second pass (candidate: prose-editor backend seam). `prose-editor.tsx` (602 lines) already concentrates the right pure logic in helper modules (`anchor-cm`, `anchor-tiptap`, `editor-geometry`, `buffer-sync`, `block-ranges`, `lib/vim/*`, `shared-prose-extensions`). What remains interleaved is the **dispatch**:

- `ProseEditorHandle` is one interface with **two backends** behind it.
- All twelve handle methods (`getContent`, `setContent`, `getSelection`, `focus`, `getCurrentBlock`, `addAnchorAtBlock`, `removeAnchor`, `revealAnchor`, `focusAnchorBlock`, `getScrollElement`, `getBlocks`, `setHighlightedAnchor`) branch on mode inline — a ~180-line `useImperativeHandle`.

The interface exists and two real implementations sit behind it: by the skill's own rule, **two adapters justify the seam**. This is a ports-and-adapters deepening, not a new abstraction.

### Resolved design decisions

- **Adapter extraction only** — keep `ProseEditor` a single component. The two editors are still instantiated on every mount; the further "split into two components so the inactive backend isn't created" (the author's line-299 note) is explicitly **out of scope** here.
- **`ProseEditorHandle` is the contract.** Both adapters implement it via TS, so a missing or renamed method is a compile error — that enforcement is the point of the seam.
- **No behavior change.** Pure structural extraction; existing prose-editor and inline-fragment-editor tests are the regression guard.

### Constraints the implementation must respect

- Adapters are **pure factories**, not hooks: `createCodeMirrorProseAdapter(deps)` / `createTiptapProseAdapter(deps)` returning a `ProseEditorHandle`. React state they need (`viewRef` access, the `content` fallback when no view/editor, `setCmValue`, `onChange` notification, `richScrollerRef`) is injected through `deps`, so each adapter can be constructed against a backend instance in a test.
- The existing helper imports (anchor stores, geometry, marker split/insert/strip, block ranges) stay where they are; the adapters call them.
- The render branch (returning `<CodeMirror>` vs `<EditorContent>` / `<ProseToolbar>`) stays in the component — only the imperative handle is refactored.
- The CodeMirror `onCreateEditor` setup (anchor seeding, `Vim.defineEx`/`defineOperator`, clipboard patching, focus-and-center) is mount lifecycle, not handle surface — it stays in the component, not the adapter.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `prose-editor-backend-adapters` from the current branch

### Phase 1 — Extract the CodeMirror adapter

**Goal**: The vim/raw branch of every handle method moves into one factory; the handle delegates to it for that mode.

- [ ] Create `createCodeMirrorProseAdapter(deps): ProseEditorHandle` (co-located with `prose-editor`)
- [ ] Move the `vimMode || rawMarkdownMode` implementation of all twelve methods into it
- [ ] Inject `deps` (view accessor, content fallback, `setCmValue`, change notifier)
- [ ] In `ProseEditor`, the vim/raw branch of `useImperativeHandle` calls the adapter; the rich branch stays inline for now
- [ ] `git commit`

### Phase 2 — Extract the TipTap adapter

**Goal**: The rich branch moves into its own factory; the handle becomes a single adapter selection.

- [ ] Create `createTiptapProseAdapter(deps): ProseEditorHandle`
- [ ] Move the rich (non-vim/raw) implementation of all twelve methods into it
- [ ] Reduce `useImperativeHandle` to selecting the active adapter (`vimMode || rawMarkdownMode ? cm : tiptap`), removing the per-method branching
- [ ] `git commit`

### Phase 3 — Tests

**Goal**: Each adapter exercised against its backend through the `ProseEditorHandle` interface.

- [ ] Adapter tests constructing a real CodeMirror view / TipTap editor and asserting the handle methods (content round-trip with markers, selection capture, anchor add/remove/reveal, block enumeration)
- [ ] Confirm existing `inline-fragment-editor` and prose-editor coverage still passes
- [ ] `git commit`

### Phase 4 — Verify and close

- [ ] `bun run format`
- [ ] `bun run verify` — fix any lint / type / test failures
- [ ] Remove any `references/suggestions.md` entries made obsolete by this work
- [ ] Set this plan's status to `Done` (or `In progress` if partial)
- [ ] `git commit`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The seam exists to be tested: each adapter should be exercised against a constructed backend instance through `ProseEditorHandle`, covering the marker-aware content round-trip (ADR 0009), selection capture, the anchor operations, and block enumeration — coverage that currently only exists implicitly via the mounted editor.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

**Implementation order (relative to the other plans)**: independent — it touches only `prose-editor` and the new adapter files, and consumers use `ProseEditorHandle` unchanged. No ordering constraint with `optimistic-mutation-primitive.md`, `project-settings-consolidation.md`, or `overview-surface-hooks.md`; land it whenever convenient.

This is a pure refactor with no behavior change, so no spec needs a `shipped` update.
