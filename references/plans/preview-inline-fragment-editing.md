# Preview inline fragment editing + unified minimal editor

**Date**: 08-06-2026
**Status**: Done
**Specs**: `specifications/preview.md`, `specifications/sequencer.md`

---

## Goal

> Double-clicking a fragment in the Preview page (or the Overview spine) opens a shared minimal text-only editor in place — vim/rich/raw per the global setting — that saves to the backend and re-fetches the surface, with no metadata editing and no imperative surgery on the markdown-rendered DOM.

---

## Tasks

### Phase 0 — Branch

- [x] Already on worktree branch `agent/inline-editing`. Confirm; STOP if not.
- [x] Commit plan.

### Phase 1 — Shared minimal editor

- [x] **`InlineFragmentEditor` component.** Wrap `ProseEditor` with a small save / cancel / saving footer + `Cmd/Ctrl+Enter` save and `Esc` cancel. Text-only, no metadata, no key rename, no extract/insert, no margin panel. Read `vimMode` / `rawMarkdownMode` / `fontSize` / `maxParagraphWidth` / `vimClipboardSync` from `useProjectEditorConfig(projectId)`. Props: `content` (raw body in), `onSave(content)`, `onCancel`, `isSaving`. Not the full `EntityEditorShell` — its `editorScope` is a singleton (can't be the spine editor) and it carries unwanted metadata/key-rename/extract-insert. Accepted loss vs the shell: swap-recovery and extract/insert.
- [x] Tests: save emits current content; cancel reverts; `Cmd+Enter` saves; `Esc` cancels; `vimMode` prop is passed through to `ProseEditor`.

### Phase 2 — Overview: double-click + adopt the shared editor

- [x] In `OverviewPage/components/FragmentProse.tsx`, replace the plain `<textarea>` editing branch with `InlineFragmentEditor`. Behavior (begin/cancel/save → `onSaveContent(fragmentUuid, content)`) is unchanged; this upgrades the overview editor to rich/vim for free.
- [x] Add `onDoubleClick → beginEditing` to the fragment container while **keeping** the pencil icon. Resolve the double-click-also-fires-single-click issue so a double-click does not leave a stray selection / toggle the row selection (e.g. guard `onSelect` / clear selection on enter-edit).
- [x] Tests: double-click enters edit; pencil still enters edit; single-click still selects without entering edit.

### Phase 3 — Preview: in-place editing via markdown string-split

- [x] **Double-click → fragment resolution.** On `onDoubleClick` over the preview `<main>`, find the nearest preceding `.fragment-anchor` element (via `compareDocumentPosition`) and read its `fragment-<uuid>` id. Clicks before the first anchor / inside injected section headings resolve to nothing → ignore.
- [x] **Fetch raw body.** `useGetFragment(projectId, uuid).content`. The assembled markdown is **not** the raw body (titles / section headings / separators injected, margin anchors stripped), so the editor must be seeded from the fetched fragment, not from the rendered prose.
- [x] **String-split rendering.** When a fragment is being edited, split `assembled.markdown` at that fragment's anchor sentinel and the next sentinel (`anchorSentinel(uuid)` / `ANCHOR_SENTINEL_LINE_PATTERN` from `@maskor/shared/sentinel`). Render `<ReadonlyProse before/>` → `<InlineFragmentEditor rawBody/>` → `<ReadonlyProse after/>`. The editor is a normal flow element so it expands/reflows as text is added. **Do not** mount React into the ProseMirror-owned DOM (PM redraws/`setContent` wipe injected nodes; a fragment is a run of blocks, not one div; a detached `createRoot` loses context).
- [x] **One editor at a time.** Track the editing fragment uuid in state; guard switching while dirty (confirm or block).
- [x] **Save round-trip.** On save: `useUpdateFragment` → invalidate `getGetAssembledSequenceQueryKey(projectId, sequenceId, params)` (and the fragment query) → refetch returns the surface to the single `ReadonlyProse` instance → re-scroll to the edited fragment's anchor (reuse `useFragmentAnchor`).
- [x] Tests: double-click → correct uuid resolution; split-around-sentinel correctness (before / editor / after boundaries); save → invalidate → re-scroll round trip.

### Phase 4 — Margin-anchor safety

- [x] **Round-trip test (required).** A fragment body containing margin-comment anchors (`<!--c:ID-->`) edited through `InlineFragmentEditor` (rich/vim) and saved must preserve the anchors verbatim. Anchors ride along invisibly; no margin panel manages them here.

### Phase 5 — Specs + verify + commit

- [x] **Update `specifications/preview.md`.** It currently mandates read-only ("no click-to-edit" out of scope; "preview never writes to vault/DB"). Reverse that for double-click inline editing, resolve open question (2026-05-18, click-to-edit deferred): anchor IDs are sufficient to _identify_ a fragment, but content needs a separate fetch and a markdown string-split — no richer per-fragment wrapper required. Update Scope / Constraints / Acceptance + `Shipped`.
- [x] **Update `specifications/sequencer.md` `Shipped`** for the overview double-click + shared minimal editor (Phase 4 of the overview redesign now uses the unified editor with vim support).
- [x] `bun run format`, then `bun run verify`; fix lint/test/codegen-sync issues.
- [x] `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Key risk areas: markdown split-around-sentinel boundaries (before/editor/after); double-click → uuid resolution (and the no-target cases); margin-anchor lossless round-trip; save → invalidate → re-scroll.

## Notes

Tradeoffs recorded: while editing, the preview transiently holds two read-only ProseMirror instances + the editor, and pays a markdown parse per edit-open (note for novel-scale). The edited fragment's injected title / section heading is hidden while editing it (acceptable — body edit only). The edited fragment's sidebar anchor is briefly absent during edit.

No new API routes — `useGetFragment` / `useUpdateFragment` already exist, so no `bun run codegen` needed.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
