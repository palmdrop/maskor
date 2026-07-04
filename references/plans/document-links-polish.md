# Document links polish — wrong target after split, Tab-accept, toolbar button, links in comments

**Date**: 04-07-2026
**Status**: Todo
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

- [ ] Create branch `agent/document-links-polish` from main.

### Phase 1 — Wrong target after split (bug)

- [ ] Reproduce: split a fragment (pieces with derived/suffixed keys), insert a `[[fragments/…]]` link picked from autocomplete, navigate it. Establish where the wrong target comes from: stale `useListFragments` cache feeding the suggestion items / `toFragmentLookup`, key suffix mismatch between preview and commit, or server-side link-table binding. Write the failing test at the layer the bug actually lives.
- [ ] Fix accordingly (candidates, pending reproduction: invalidate the entity-list caches the link lookups read from after a split — the split dialog invalidates `listFragments` already, so check which surface held the stale cache; or resolve inserted links by uuid at insert time rather than key at navigate time — do **not** change the canonical `[[type/key]]` form, see spec Prior decisions).
- [ ] Regression test.

### Phase 2 — Tab accepts autocomplete (all modes)

- [ ] TipTap popup: treat Tab like Enter (accept selected item, consume the event) in `document-link-suggestion-tiptap.ts` `onKeyDown`.
- [ ] CM6 (raw + vim): bind Tab to `acceptCompletion` while the completion popup is active (scoped so Tab keeps its normal behavior otherwise), in `document-link-cm.ts`.
- [ ] Tests for both editors.

### Phase 3 — Rich-mode toolbar link button

- [ ] Add a link button to `prose-toolbar.tsx` (lucide `Link` icon, matching the existing `ToolbarButton`s) that dispatches `commands.run("editor:insert-link")` — the command already handles the picker + cursor restoration.
- [ ] Test: button renders in rich mode and dispatches the command.

### Phase 4 — Links in comments (feature)

- [ ] Wire document links into the Margin slot editors (`slot-editor.tsx`): rich mode gets the `DocumentLink` extension + `[[` suggestion popup; raw/vim get `cmDocumentLinkExtension` + the CM autocomplete. Thread the links API (`useDocumentLinks` lookups/resolve/navigate) down from the fragment editor through `margin-column.tsx` props — reuse the existing extension builders, no parallel link implementation.
- [ ] Render `[[…]]` links in **static** (non-editing) comment text in the column with resolved/broken styling and click-to-navigate (`margin-row.tsx`; check how static comment text is rendered and reuse the resolver).
- [ ] Scope decision (respect it): comment bodies do **not** become link-table sources — no backlinks from comments, no auto-attach. Comments are Margin blocks, not vault link sources (ADR 0007; `specifications/document-links.md` scopes comments out). Record the decision as an open question in `specifications/document-links.md` if backlinks-from-comments ever becomes desirable.
- [ ] The general-notes editor in the Margin uses the same `SlotEditor` — verify links work there too (it comes for free or note why not).
- [ ] Tests: autocomplete triggers in a comment editor; a resolved link in a static comment navigates; a broken link renders broken.

### Phase 5 — Close out

- [ ] `bun run format` then `bun run verify`; fix all issues.
- [ ] Update the `Shipped` frontmatter of `specifications/document-links.md` (all four phases belong there); set plan status; commit.

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
