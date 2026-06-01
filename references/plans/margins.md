# Margins: fragment notes & anchored comments

**Date**: 01-06-2026
**Status**: Todo
**Specs**: `specifications/margins.md`, `references/adr/0007-margin-anchored-comments-supersede-file-based-comments.md`

---

## Goal

> A fragment can own a Margin document (`margins/<key>.md`) holding free-form notes and block-anchored comments, edited side-by-side with the fragment in both rich and vim modes; anchors survive editor round-trips and fragment edits, orphans degrade gracefully, the fragment↔Margin pair shares swap/restore, and the old fragment `notes:` attachment list is gone — all backed by markdown vault files with a derived DB index.

---

## Tasks

Phases are ordered so each is independently committable and leaves the app working. A phase that only updates docs is still a real commit. Backend phases (1–2) land before the editor/UI phases (4–7). The disruptive removal (Phase 8) lands after the Margin surface exists so fragment-level thinking has a home first.

### Phase 0 — Branch & spec groundwork

On-disk representation, lifecycle, DB shape, and CM6 rendering are now resolved in `specifications/margins.md` Prior decisions (session 2026-06-01) — Phase 0 no longer needs to settle them. Carried forward: marker = `<!--c:ID-->`; comment = `<!--c:ID-->` + `> excerpt` + body; empty Margins persist (not auto-removed); per-comment DB rows; CM6 hide + gutter cue + reveal-on-block-cursor; export/preview strip markers.

- [ ] Create branch `margins` based on this plan title. (The design artifacts from the 2026-06-01 session are already in the working tree — they carry over to the new branch.)
- [ ] **First commit — docs only, before any code or further spec edits.** Commit the existing uncommitted working-tree design artifacts so the branch opens with the agreed design recorded: `specifications/_glossary.md` (new Margin/Comment/Anchor/Orphaned-comment/Annotatable-entity terms + Note update + flagged ambiguity), `references/adr/0007-margin-anchored-comments-supersede-file-based-comments.md`, `specifications/margins.md`, and this plan (`references/plans/margins.md`). Nothing else goes in this commit.
- [ ] `specifications/fragment-model.md`: loosen the "Maskor never edits fragment content" constraint to "never edits fragment **prose** except through user actions; anchor markup written when the user authors a comment is a permitted, user-initiated edit." Add a Prior decision pointing to ADR 0007. (Spec text only — no behaviour change yet.)
- [ ] `specifications/document-links.md`: remove comments from the future scope / "comments are not anchor-scoped" prior decision; add a note that comments now live in `margins.md` (→ ADR 0007). Leave the notes auto-sync rule in place for now (changed in Phase 8).
- [ ] Update `references/CODEBASE_SNAPSHOT.md` if stale (`bun run snapshot`) so later phases reference current structure.
- [ ] Commit.

### Phase 1 — Storage: the `margins/` entity (backend)

- [ ] Define the Margin file model in `packages/storage`: path `margins/<fragment-key>.md`, frontmatter `fragmentUuid` + `createdAt`/`updatedAt`, body = `## Notes` section + `## Comments` section. Mirror the existing note/reference reader/writer patterns.
- [ ] Parser/serialiser for the comments section: each comment serialises as `<!--c:ID-->` + `> excerpt` + body prose, blank-line separated; parser splits on the id-comment lines; round-trip safe and Obsidian-legible. Fragment-side `<!--c:ID-->` marker parse/strip helper (shared with editor and export phases).
- [ ] Lazy create on first note/comment; Margins persist once created (no auto-removal).
- [ ] Rename cascade: fragment rename renames the Margin file (extend the existing rename-cascade mechanism). Discard moves Margin to `margins/discarded/<key>.md`; delete moves it to trash alongside the fragment.
- [ ] `fragmentUuid` is the stable join; handle the case where the Margin's stem and its fragment's key disagree after an external rename (orphan/warning behaviour consistent with `attachments.md`).
- [ ] Tests: create/read/write/rename/discard/delete, round-trip fidelity, lazy create, persist-when-emptied, external-rename mismatch.
- [ ] `specifications/storage-sync.md` (and `attachments.md` if it documents the shared reader pattern): add the `margins/` directory and its sync rules. Update Shipped where applicable.
- [ ] `specifications/margins.md`: add a Shipped entry for storage. Commit.

### Phase 2 — DB index, watcher sync & API (backend)

- [ ] Index margins/comments in the per-vault DB as **per-comment rows** (`fragment_uuid`, `marker_id`, excerpt, resolved/orphan flag, ordinal) plus a margin row. Rebuild + live watcher sync, consistent with the existing vault content index.
- [ ] API routes: read/write a fragment's Margin; create/update/delete a comment; resolve/list orphaned comments. Detect orphans (marker missing for a stored comment) on sync.
- [ ] Watcher re-parses externally-edited Margin and fragment files; recomputes anchor resolution and orphan state.
- [ ] `bun run codegen` (regenerate OpenAPI snapshot + orval) for the new routes.
- [ ] Tests: index rebuild, watcher live updates, orphan detection on block/marker removal, external-edit re-parse.
- [ ] `specifications/storage-sync.md` / `margins.md`: Shipped entries. Commit.

### Phase 2b — Export/preview marker stripping

Independently committable; depends only on the Phase 1 strip helper.

- [ ] Wire the shared export/preview assembly path to strip `<!--c:ID-->` markers from fragment bodies before output (Markdown, plain text, Word, PDF, and the preview surface).
- [ ] Tests: assembled export/preview output contains no `<!--c:ID-->` markers; otherwise byte-identical to pre-marker assembly.
- [ ] `specifications/export.md` / `preview.md`: note the marker-strip step; Shipped entries.
- [ ] Commit.

### Phase 3 — Anchor markers in the editors (shared extension work)

- [ ] CM6 (vim/raw mode): decoration plugin that hides the whole `<!--c:ID-->` with a zero-width `Decoration.replace` (no gap), shows a subtle gutter dot / line-end glyph on blocks that carry a comment, and reveals the raw marker only when the cursor enters that block (per-block, Obsidian live-preview style). Marker is preserved verbatim in the buffer.
- [ ] TipTap (rich mode): node attribute (or equivalent) carrying the marker id, with matching markdown parse + serialize so the marker survives markdown→ProseMirror→markdown.
- [ ] Round-trip guard tests: fragment with markers edited in TipTap then vim (and vice versa) preserves all markers byte-stable.
- [ ] `specifications/fragment-editor.md`: document the marker rendering in both modes; Shipped entry.
- [ ] Commit.

### Phase 4 — Comment-creation gesture (fragment side)

- [ ] Command-palette command, vim binding, and toolbar button to "comment this block": inject/ensure the trailing marker on the block at the cursor, create the bound comment stub in the Margin seeded with the block excerpt, move focus to the Margin panel.
- [ ] Coordinated buffer edits only — no force-flush; marker lands on next fragment save, stub on next Margin save.
- [ ] Respect the command-system precedence rules (commands fire before reaching the editor; no double-trigger in vim — see `command-palette.md`).
- [ ] Tests: gesture from each entry point, marker injected, stub created with excerpt, focus moved, no premature persistence.
- [ ] `specifications/fragment-editor.md` / `margins.md`: Shipped entries. Commit.

### Phase 5 — Linked swap pair (fragment ↔ Margin)

- [ ] Extend the `.maskor/swap/` mechanism so the fragment and its Margin are a linked pair: unsaved edits to either are mirrored; on reopen both restore together under a single banner; never one without the other.
- [ ] Revert/keep applies to the pair atomically.
- [ ] Tests: crash/reopen with unsaved edits in fragment only, Margin only, and both; single banner; atomic revert.
- [ ] `specifications/fragment-editor.md`: Shipped entry (extends the 2026-05-19 swap entry). Commit.

### Phase 6 — Side-by-side Margin panel (UI)

- [ ] Margin panel rendered beside the fragment editor as a self-contained pair component (designed for later reuse as a graph-canvas node).
- [ ] Notes section as a prose editor; comments section as the linear comment list bound to blocks.
- [ ] Collapsed (default): compact markers/badges aligned to annotated blocks. Expanded: alignment padding so blocks and comments correspond. Per-section toggle + global default-state toggle. Scroll correspondence.
- [ ] Orphaned-comment group at the foot of the comments section with last-known excerpt; user-only removal.
- [ ] Tests (component + interaction): collapse/expand, alignment, toggle persistence, orphan group rendering and removal.
- [ ] `specifications/margins.md`: Shipped entry for the surface. Commit.

### Phase 7 — Orphan handling end-to-end

- [ ] Wire backend orphan detection (Phase 2) to the panel: comments whose marker is gone render in the orphaned group; resolving the anchor (re-adding matching text/marker) rebinds them where feasible, else they stay orphaned.
- [ ] Confirm the self-healing desync cases: marker-without-comment is inert/cleanable; comment-without-marker is an orphan.
- [ ] Tests: delete annotated block → orphan; external marker strip → orphan; rebind path.
- [ ] `specifications/margins.md`: Shipped entry. Commit.

### Phase 8 — Drop the fragment `notes:` attachment & rework notes auto-sync

- [ ] Remove the `notes:` attachment list from the fragment model (`packages/storage`, API, frontend metadata form). Preserve unknown frontmatter keys on save (do not strip user data).
- [ ] `document-links.md`: change the notes auto-sync rule — inline `[[notes/foo]]` no longer adds to a fragment note list (the list is gone); notes become link-table/backlink citizens only. References and aspects keep their auto-sync behaviour. Update the table and acceptance criteria.
- [ ] `attachments.md`: notes are project-scope only; remove the fragment-attachment behaviour for notes (keep it for references). Update Outcome, Scope, Behavior, Acceptance criteria, and Shipped.
- [ ] `notes.md`: notes are project-scope; remove "attachable to fragments"; describe surfacing via document-links. Update Shipped.
- [ ] `specifications/fragment-model.md`: remove `notes` from the fragment model fields and acceptance criteria; Shipped entry.
- [ ] `bun run codegen` for the changed fragment/notes routes.
- [ ] Migration consideration: existing fragments may carry a `notes:` list. Decide and implement handling (drop silently on next write vs. one-time surfacing as a warning). Record the decision in `margins.md` or a note.
- [ ] Tests: fragment create/save has no notes-attachment field; inline `[[notes/foo]]` does not create an attachment; references/aspects auto-sync unchanged; unknown keys preserved.
- [ ] Commit.

### Phase 9 — Final reconciliation

- [ ] `bun run format` then `bun run verify`; fix lint/test/codegen-sync failures.
- [ ] Sweep all touched specs for Shipped accuracy and Status (`Draft` → `Stable` where appropriate, esp. `margins.md`).
- [ ] Add any surprises encountered to `references/SUGGESTIONS.md`.
- [ ] Set this plan's Status to `Done` (or `In progress` if partial); set `Closed` date.
- [ ] Final commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Priority test targets: storage round-trip fidelity (vault→DB→vault preserves notes, comment bodies, anchors, excerpts), anchor marker survival across TipTap↔vim round-trips, orphan detection on block/marker removal, the linked swap pair restoring both-or-neither, and the comment gesture producing marker + stub + focus move without premature persistence.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Cross-cutting note: each phase already carries its own spec-Shipped task so tracking does not bunch up at the end. The disruptive `notes:` removal (Phase 8) is deliberately last among feature phases — the Margin must be a working home for fragment-level thinking before the old attachment is taken away.
