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

- [x] Create branch `margins` based on this plan title. (The design artifacts from the 2026-06-01 session are already in the working tree — they carry over to the new branch.)
- [x] **First commit — docs only, before any code or further spec edits.** Commit the existing uncommitted working-tree design artifacts so the branch opens with the agreed design recorded: `specifications/_glossary.md` (new Margin/Comment/Anchor/Orphaned-comment/Annotatable-entity terms + Note update + flagged ambiguity), `references/adr/0007-margin-anchored-comments-supersede-file-based-comments.md`, `specifications/margins.md`, and this plan (`references/plans/margins.md`). Nothing else goes in this commit.
- [x] `specifications/fragment-model.md`: loosen the "Maskor never edits fragment content" constraint to "never edits fragment **prose** except through user actions; anchor markup written when the user authors a comment is a permitted, user-initiated edit." Add a Prior decision pointing to ADR 0007. (Spec text only — no behaviour change yet.)
- [x] `specifications/document-links.md`: remove comments from the future scope / "comments are not anchor-scoped" prior decision; add a note that comments now live in `margins.md` (→ ADR 0007). Leave the notes auto-sync rule in place for now (changed in Phase 8).
- [x] Update `references/CODEBASE_SNAPSHOT.md` if stale (`bun run snapshot`) so later phases reference current structure.
- [x] Commit.

### Phase 1 — Storage: the `margins/` entity (backend)

- [x] Define the Margin file model in `packages/storage`: path `margins/<fragment-key>.md`, frontmatter `fragmentUuid` + `createdAt`/`updatedAt`, body = `## Notes` section + `## Comments` section. Mirror the existing note/reference reader/writer patterns.
- [x] Parser/serialiser for the comments section: each comment serialises as `<!--c:ID-->` + `> excerpt` + body prose, blank-line separated; parser splits on the id-comment lines; round-trip safe and Obsidian-legible. Fragment-side `<!--c:ID-->` marker parse/strip helper (shared with editor and export phases) — `@maskor/shared` `comment-marker.ts`.
- [x] Lazy create on first note/comment; Margins persist once created (no auto-removal).
- [x] Rename cascade: fragment rename renames the Margin file (wired into `fragments.write`). Discard moves Margin to `margins/discarded/<key>.md`; delete removes it alongside the fragment (matches fragment delete = unlink; no trash folder exists).
- [x] `fragmentUuid` is the stable join; the mapper preserves it even when the filename stem disagrees after an external rename (test covers the mismatch). Indexer-level orphan/warning behaviour lands in Phase 2.
- [x] Tests: create/read/write/rename/discard/delete, round-trip fidelity, lazy create, persist-when-emptied, external-rename mismatch.
- [x] `specifications/storage-sync.md`: added the `margins/` directory and its storage rules + Shipped entry. (`attachments.md` unchanged — it does not document the shared reader pattern.)
- [x] `specifications/margins.md`: add a Shipped entry for storage. Commit.

### Phase 2 — DB index, watcher sync & API (backend)

- [x] Index margins/comments in the per-vault DB as **per-comment rows** (`fragment_uuid`, `marker_id`, excerpt, body, orphan flag, ordinal) plus a margin row. Rebuild + live watcher sync, consistent with the existing vault content index.
- [x] API routes: read/replace a fragment's Margin; create/update/delete a comment; list orphaned comments (removal of an orphan is `deleteComment`). Detect orphans (marker missing for a stored comment) on sync.
- [x] Watcher re-parses externally-edited Margin and fragment files; recomputes anchor resolution and orphan state (fragment edits recompute the bound Margin's orphan flags).
- [x] `bun run codegen` (regenerate OpenAPI snapshot + orval) for the new routes.
- [x] Tests: index rebuild + re-derive, watcher live updates, orphan detection on marker add/remove, external margin add/delete.
- [x] `specifications/storage-sync.md` / `margins.md`: Shipped entries. Commit.

### Phase 2b — Export/preview marker stripping

Independently committable; depends only on the Phase 1 strip helper.

- [x] Wire the shared export/preview assembly path to strip `<!--c:ID-->` markers from fragment bodies before output (`assembleMarkdown` body emission — the single chokepoint for Markdown, plain text, Word, PDF, and the preview surface).
- [x] Tests: assembled output contains no `<!--c:ID-->` markers; otherwise byte-identical to pre-marker assembly.
- [x] `specifications/export.md` / `preview.md`: note the marker-strip step; Shipped entries.
- [x] Commit.

### Phase 3 — Anchor markers in the editors (shared extension work)

- [x] CM6 (vim/raw mode): decoration plugin (`comment-marker-cm.ts`) hides the whole `<!--c:ID-->` with a zero-width `Decoration.replace` (no gap), marks the line with a subtle line-end cue, and reveals the raw marker only when the cursor is on that line (Obsidian live-preview style). Marker preserved verbatim in the buffer.
- [x] TipTap (rich mode): a schema-modeled invisible inline node (`comment-marker-extension.ts`) carrying the marker id, with markdown-it parse + serialize so the marker survives markdown→ProseMirror→markdown.
- [x] Round-trip guard tests: TipTap markdown→PM→markdown preserves markers byte-stable; CM6 decorations hide/reveal correctly. (Per-block line cue uses line number; granular block ≈ line.)
- [x] `specifications/fragment-editor.md`: document the marker rendering in both modes; Shipped entry.
- [x] Commit.

### Phase 4 — Comment-creation gesture (fragment side)

- [x] Command-palette command, vim binding, and toolbar button to "comment this block": inject/ensure the trailing marker on the block at the cursor, create the bound comment stub in the Margin seeded with the block excerpt, move focus to the Margin panel.
- [x] Coordinated buffer edits only — no force-flush; marker lands on next fragment save, stub on next Margin save.
- [x] Respect the command-system precedence rules (commands fire before reaching the editor; no double-trigger in vim — see `command-palette.md`). The gesture is a command-system hotkey (`mod+shift+m`), so the existing modifier-key interception in `prose-editor.tsx` suppresses the vim binding automatically.
- [x] Tests: gesture from the button entry point through the real command system, marker injected, stub created with excerpt, focus moved, no premature persistence; the command's shared hotkey covers the palette/vim entry points.
- [x] `specifications/fragment-editor.md` / `margins.md`: Shipped entries. Commit.

### Phase 5 — Linked swap pair (fragment ↔ Margin)

- [x] Extend the `.maskor/swap/` mechanism so the fragment and its Margin are a linked pair: unsaved edits to either are mirrored; on reopen both restore together under a single banner; never one without the other.
- [x] Revert/keep applies to the pair atomically.
- [x] Tests: crash/reopen with unsaved edits in fragment only, Margin only, and both; single banner; atomic revert.
- [x] `specifications/fragment-editor.md`: Shipped entry (extends the 2026-05-19 swap entry). Commit.

### Phase 6 — Side-by-side Margin panel (UI)

- [x] Margin panel rendered beside the fragment editor as a self-contained pair component (designed for later reuse as a graph-canvas node).
- [x] Notes section as a prose editor; comments section as the linear comment list bound to blocks.
- [x] Collapsed (default): compact comment previews. Expanded: editable comment bodies. Per-section toggle (notes, comments) + global compact/expanded toggle, all persisted. Scroll correspondence via click-to-reveal block. (Pixel-perfect block alignment padding deferred — see SUGGESTIONS.md.)
- [x] Orphaned-comment group at the foot of the comments section with last-known excerpt; user-only removal.
- [x] Tests (component + interaction): collapse/expand, toggle persistence, orphan group rendering and removal, comment ordering.
- [x] `specifications/margins.md`: Shipped entry for the surface. Commit.

### Phase 7 — Orphan handling end-to-end

- [x] Orphan detection wired to the panel: comments whose marker is gone render in the orphaned group; re-adding the marker rebinds them. The panel derives this live from the open fragment buffer (more responsive than the persisted backend flag, which still serves cross-fragment/persisted queries). Re-adding the exact marker rebinds; re-adding only matching prose does not (the marker is the authoritative anchor).
- [x] Confirmed the self-healing desync cases: marker-without-comment is inert/cleanable; comment-without-marker is an orphan.
- [x] Tests: delete annotated block → orphan; external marker strip → orphan; rebind path; inert stray marker.
- [x] `specifications/margins.md`: Shipped entry. Commit.

### Phase 8 — Drop the fragment `notes:` attachment & rework notes auto-sync

- [x] Removed the `notes:` attachment list from the fragment model (`packages/storage` domain schema, mapper, indexer, DB table + drop migration; API command/routes/schemas; frontend metadata form + read-only display + commands). Added unknown-frontmatter preservation via `extraFrontmatter` (storage-internal, omitted from API responses) so a Maskor save never strips user data.
- [x] `document-links.md`: changed the notes auto-sync rule — inline `[[notes/foo]]` no longer adds to a fragment note list (gone); notes are link-table/backlink citizens only. References/aspects unchanged. Table + acceptance criteria + decisions updated.
- [x] `attachments.md`: notes are project-scope only; reference attachment retained. Outcome, Scope, Behavior, Shipped updated.
- [x] `notes.md`: notes are project-scope; removed "attachable to fragments"; surfaced via document-links. Shipped updated.
- [x] `specifications/fragment-model.md`: removed `notes` from fields and acceptance criteria; Shipped + Prior decision entries.
- [x] `bun run codegen` for the changed fragment routes.
- [x] Migration: existing `notes:` lists are **dropped silently on the next Maskor write** (greenfield, no live users). The mapper treats `notes` as a managed-but-removed key and excludes it from preservation; every other unmanaged key survives. Decision recorded in `fragment-model.md` (Prior decisions) and `margins.md` Open question resolved below.
- [x] Tests: fragment create/save has no notes-attachment field; `[[notes/foo]]` does not create an attachment (no inline-link machinery exists yet — N/A in code, asserted in spec); references/aspects auto-sync unchanged (reference cascade + aspect-notes cascade tests pass); unknown keys preserved (mapper + vault round-trip tests).
- [x] Commit.

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
