# Buffer-clean anchoring & editor-driven flow alignment

**Status**: accepted — refines `references/adr/0008-margin-is-an-annotated-paragraphs-column.md` (the layout model) and supersedes the **in-buffer-marker** aspect of `references/adr/0007-margin-anchored-comments-supersede-file-based-comments.md` (the on-disk marker as the durable anchor is **retained**). Supersedes the "CM6/vim marker rendering" and "live-derive binding from the in-body marker" prior decisions in `specifications/margins.md`.

ADR 0007 settled _what_ a comment is (an anchored block, durably marked by an in-text `<!--c:ID-->`). ADR 0008 settled the _layout_ (a per-paragraph, flow-aligned column). Both shipped, but the result has two persistent faults: the column does not stay aligned once a comment is taller than its block, and the marker living in the **live editor buffer** breaks caret behaviour at the end of a paragraph. This ADR settles two refinements that fix those faults without abandoning the flow-aligned-column goal or the on-disk marker.

## Decision

**1. The editor is the single source of truth for block enumeration _and_ geometry.** The editor emits an authoritative `blocks[] = { markerId | null, top, height }` measured from its own rendered DOM (CM6 `coordsAtPos` over block ranges; TipTap `nodeDOM`/`offsetTop` per top-level node). The Margin column renders one row per entry, in that order, and binds comments by `markerId`. The Margin no longer parses the markdown itself — its previous independent `enumerateBlocks` produced a different block-index space from the editor's DOM nodes (e.g. `# Heading\ntext` is one parser-block but two TipTap nodes), and every alignment bug downstream inherited that disagreement.

**2. Flow alignment is mutual padding.** Per row, `rowHeight = max(block.height, commentHeight)`, derived from natural (unpadded) measurements so a single measure→compute→apply pass converges. Comments shorter than their block are padded on the **margin side**; blocks shorter than their comment get a **document-side spacer** (TipTap node decoration / CM6 block widget) that adds vertical space below the block — never mutating buffer text, markdown, or serialization. The two columns scroll as **two scrollers with `scrollTop` mirroring**, which is exact once the columns are geometrically congruent (a single physical scroller is rejected — it disables CM6/vim internal scrolling like `Ctrl-d/u`/`zz` and hurts large-document performance).

**3. The editor buffer holds pure markdown; the marker is stripped on load and re-emitted on save.** The `<!--c:ID-->` marker stays the durable, portable, Obsidian-legible anchor **on disk** (invisible in rendered markdown; the backend storage, DB index, export/preview strip, and orphan detection are unchanged) but is **never present in the live editor buffer**. This removes the marker from the caret's path, fixing end-of-paragraph editing.

**4. Live binding is position-mapping; fuzzy matching is the recovery path only.** While editing inside Maskor, each comment's anchor is held as an editor position and mapped forward through every transaction (ProseMirror `tr.mapping`; CM6 `StateField.map(tr.changes)`) — deterministic, so a moved/edited paragraph carries its anchor without guessing. Index + excerpt **fuzzy matching** is used _only_ where positions cannot be mapped: on file load (re-derive positions from the stored markers) and after an external edit or whole-document replace. Crash/swap recovery stores the anchor positions in the Maskor-internal swap JSON so the linked fragment+Margin pair rebinds **precisely**, not via fuzzy.

## Why

- **Alignment is the point (ADR 0008), and it only holds with both halves.** Margin-side padding alone drifts every row below the first comment taller than its block. The document-side spacer — deferred in margins-2 as "the fragile half" — is what actually keeps rows aligned. Driving both columns from one block-geometry source removes the index-space mismatch that made the old padding wrong even before long comments.
- **The marker's value is portability and recovery, not live editing.** On disk it is a stable, human-readable anchor that survives external tools. In the live buffer it is only a liability (caret hazard). Position-mapping gives a _better_ live binding than the in-buffer marker did — exact through reorderings — so nothing is lost by removing it from the buffer.
- **Fuzzy was rightly rejected as a _primary_ binding (ADR 0007) but is the correct _fallback_.** The single-session, no-simultaneous-edit constraint (the user cannot edit a paragraph and its comment at once) makes deterministic position-mapping viable for the live case. Fuzzy then covers exactly the cases where precision is impossible anyway (external edits, whole-doc replace), where degradation is explicitly accepted: files stay human-readable and theoretically editable, but the user is encouraged to edit only within Maskor.

## Trade-off accepted

- **The Margin column is now tightly coupled to the editor's measured geometry and to a per-mode anchor-mapping plugin.** Two implementations (ProseMirror plugin + CM6 `StateField`) — but no worse than ADR 0007/0008 already required (a TipTap node _and_ a CM6 decoration), and arguably simpler (no schema node, no decoration-to-hide-text, no reveal-on-cursor).
- **External edits / whole-document replacements can mis-anchor or orphan a comment** (fuzzy best-effort). Accepted: the on-disk file is the human-readable record, but in-Maskor editing is the supported path.
- **The margins-2 in-buffer marker machinery is removed** — the TipTap `commentMarker` node, `comment-marker-cm.ts` reveal-on-cursor, and the `editor:toggle-show-source` toggle (now moot, no markers in the buffer to show). A dot cue on annotated lines is retained but driven from the anchor model.

## Out of scope / unchanged

- **On-disk format, backend storage, DB index, export/preview marker-strip, orphan detection** — unchanged. This iteration is frontend editor/column work.
- **Word/span-level anchoring** — still deferred (ADR 0007). The per-paragraph block remains the anchor unit.
- **Generalisation over annotatable entities** — unchanged (ADR 0007/0008); fragments remain the only host.
