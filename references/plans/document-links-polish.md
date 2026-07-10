# Document links polish — wrong target after split, Tab-accept, toolbar button, links in comments

**Date**: 04-07-2026
**Status**: Done
**Specs**: `specifications/document-links.md`
**Branch**: agent/document-links-polish

---

## Goal

> A link inserted after a fragment split navigates to the fragment the user picked; `[[` autocomplete accepts with Tab in all three editor modes; rich mode has a toolbar button for inserting a link; and comment editors support `[[…]]` links with autocomplete and click-to-navigate.

---

## Background (investigated 04-07-2026)

- **Wrong target after split** (`references/TODO.md`: "document links are sometimes broken. I split a document, added a document link, but then, that link pointed to the next fragment in the sequence, NOT the actually linked fragment"): link resolution is `key → uuid` from the cached `useListFragments` (`lib/document-links/useDocumentLinks.ts`); the `[[` suggestion list is fed from the same lookups. After a split mints new fragments (with `_N`-suffixed keys on collision), a stale list can make the picker insert — or the resolver navigate — the wrong fragment. Root cause not yet confirmed; needs reproduction (frontend cache vs. server link-table binding).
- **Tab-accept** (`references/TODO.md`: "tabbing when selecting link should auto-complete (atm, just enter works)"): the TipTap suggestion popup handles only Enter (`document-link-suggestion-tiptap.ts:105-124`); the CM6 autocomplete (`document-link-cm.ts`) has no Tab binding either (`@codemirror/autocomplete` defaults bind Enter, not Tab).
- **Rich-mode link button** (`references/TODO.md`: "in rich mode, add a button for adding a link"): the `editor:insert-link` command + picker already exist (`lib/commands/scopes/editor.ts:328`); the rich toolbar (`prose-toolbar.tsx`) has no button for it.
- **Links in comments** (`references/TODO.md`: "Add fragment links in comments!"): the Margin slot editor (`components/margins/slot-editor.tsx`) builds its TipTap/CM instances from `buildSharedProseExtensions()` only — no document-link extension, no autocomplete, no navigation. Static comment text in the column renders links as plain text.

---

## Tasks

### Phase 0 — Branch

- [x] Create branch `agent/document-links-polish` (from `agent/fixes`, the integration branch — not main).

### Phase 1 — Wrong target after split (bug)

- [x] Reproduce + pin root cause. **Finding (surprising — flagged):** no single reproducible defect remains on the base branch. Frontend navigation resolves `[[fragments/key]]` → uuid live at click time via `toFragmentLookup` (from `useListFragments`); the picker and resolver share **one** snapshot, so they can't disagree. The split's key derivation guarantees **distinct active keys** (verified end-to-end at the storage layer — no duplicate keys produced, even when pieces derive the same base key), and the split dialog already invalidates `listFragments` (closed by the earlier discard-and-split-integrity work). The one proven misroute mechanism is a snapshot mapping one key to two fragments, resolving to the last-in-list ("next fragment") — but that state is not reachable through split alone. The real-world report was most likely a transient stale-cache window already closed. Regression tests lock the invariants that prevent it.
- [x] No behavioural fix required (canonical `[[type/key]]` form unchanged, per spec Prior decisions). Regression tests guard the invariants.
- [x] Regression tests: backend split key-uniqueness (`split-fragment.test.ts`); frontend deterministic/active-preferring/order-independent resolution (`lib/document-links/post-split-resolution.test.ts`).

### Phase 2 — Tab accepts autocomplete (all modes)

- [x] TipTap popup: Tab treated like Enter (accept selected item, consume the event) in `document-link-suggestion-tiptap.ts` `onKeyDown`.
- [x] CM6 (raw + vim): Tab bound to `acceptCompletion` gated on `completionStatus === "active"` (high precedence; keeps normal Tab behaviour otherwise), in `document-link-cm.ts`.
- [x] Tests for both editors.

### Phase 3 — Rich-mode toolbar link button

- [x] Link button in `prose-toolbar.tsx` (lucide `Link` icon). Threaded via an `onInsertLink` callback on `ProseEditor`; the shell opens the palette aimed at `editor:insert-link`'s entity picker (the command owns the picker + cursor restoration). `command-palette:open` gained an optional command id to jump straight to a command's arg step.
- [x] Test: button renders + dispatches; palette opens directly to a command's arg picker given an initial id.

### Phase 4 — Links in comments (feature)

- [x] Document links wired into the Margin slot editors (`slot-editor.tsx`): rich gets `DocumentLink` + `[[` suggestion; raw/vim get `cmDocumentLinkExtension` + CM autocomplete. Links API prop-threaded from `fragment-editor.tsx` through `margin-column.tsx` (forward-only) — reused the existing builders.
- [x] `[[…]]` links rendered in **static** comment/notes text via a shared `LinkedText` component (resolved/broken styling + click-to-navigate) — `margin-row.tsx`, `margin-orphan-group.tsx`, `margin-notes-tab.tsx`.
- [x] Scope decision respected: comment/notes bodies are link **readers** only — no link-table sources, no backlinks, no auto-attach. Recorded as an open question in `specifications/document-links.md`.
- [x] General-notes editor (`MarginNotesTab`): links work there too — it uses the same `SlotEditor`, so support came for free (the plan-superseding note about the notes tab move was accounted for).
- [x] Tests: `LinkedText` resolve/alias/broken/plain; notes-tab static link navigate + broken; `SlotEditor` rich-mode decorates resolved/broken links.

### Phase 5 — Close out

- [x] `bun run format` then `bun run verify`; fix all issues.
- [x] Updated the `Shipped` frontmatter of `specifications/document-links.md`; set plan status; committed per phase.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 1's regression test matters most — pin the real root cause, don't test around it. Phases 2–4 are covered by focused editor/component tests mirroring the existing `document-link-*.test.ts` patterns.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Do NOT edit `references/TODO.md` — the orchestrator session updates it after review.

Heads-up: a sibling plan (`margin-orphan-and-notes-tab.md`) edits `margin-column.tsx` and moves the notes section to a gutter tab; it may run concurrently. Keep your `margin-column.tsx` changes to prop-threading only, and coordinate via the orchestrator if the notes editor moved before Phase 4 lands.
