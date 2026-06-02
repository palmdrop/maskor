# The Margin is an annotated-paragraphs column, flow-aligned to the editor

**Status**: accepted — refines `references/adr/0007-margin-anchored-comments-supersede-file-based-comments.md` (the data model) with the interaction/layout model; supersedes the "CM6/vim marker rendering: reveal-on-block-cursor" prior decision in `specifications/margins.md`. **Refined by `references/adr/0009-buffer-clean-anchoring-and-editor-driven-flow-alignment.md`**: the editor (not the Margin) is the single source of block geometry; flow alignment ships both halves (margin-side + document-side padding); the anchor marker leaves the live editor buffer (position-mapping live, fuzzy on recovery) while remaining on disk.

ADR 0007 settled _what_ a Margin comment is (an anchored block, not a file). This ADR settles _how the Margin is read, written, and laid out_. The Margin is not a sidebar list of discrete "comments." It is a **per-paragraph annotation column**: every fragment block has a slot beside it, the column scrolls in lockstep with the fragment editor, each comment is laid out **in normal flow** beside its paragraph (never absolutely positioned / floating), and rows are kept aligned by **padding** the shorter side. Creating a comment is implicit — you move down the column, land in the slot beside any paragraph (even an un-annotated one, revealed on hover), and type; the marker + comment are conjured on first non-empty content. The intended feel is "annotated paragraphs," not "comments."

## Why

The writer's mental model is marginalia — a scribble in the margin _beside_ the line it reacts to — not a chat thread docked to the side. Three properties follow from that and drive the design:

- **Alignment is the point.** A comment must sit beside its paragraph and stay there as the document and the comments grow. Flow-based mutual padding (pad the shorter of block/comment so the next row still lines up) reads as a real margin; floating comments do not, and a sparse list loses the spatial correspondence entirely.
- **Annotation should be frictionless and ambient.** If every paragraph is always one keystroke away from being annotated, commenting becomes part of writing rather than a separate "add comment" ceremony. Hence type-to-create on any paragraph and one-active-editor navigation (Tab/↓ between slots, Escape back to the prose) so the column feels like one continuous editor.
- **The binding must survive editing, including reordering.** Comments follow their paragraph because the anchor marker lives _inside_ the block (ADR 0007) and the column derives its layout **live from each marker's current position in the buffer** — never from a cached ordinal. Moving a whole paragraph carries its marker, so the scribble moves with it.

## Trade-off accepted

- **The Margin and the fragment editor stop being independent components and become one tightly-coupled, scroll-shared, flow-aligned pair.** The editor's vertical rhythm and the margin's layout are computed together. This is the opposite of the clean component separation the first Margin panel shipped with, and it is the bulk of the cost. We stage it: **margin-side padding first** (pad comments shorter than their block; clip longer ones), then **document-side padding** later (inject vertical space below a paragraph so a long comment pushes the next paragraph down). The hard, fragile half is deliberately deferred.
- **Creation is implicit, so there is no explicit "comment" object until you type.** A focused-but-untouched slot creates nothing. The old explicit "Comment this block" gesture survives only as a _jump_ to the current paragraph's slot.
- **One comment per block.** We give up "multiple comments may bind to the same block" (a line in `margins.md` we now delete) to keep the marker↔comment relationship 1:1 — no separate comment identity, no schema change, and an unambiguous "delete the comment ⇒ strip its marker." A paragraph that needs several remarks uses one multi-paragraph comment.
- **The excerpt stops being shown for anchored comments.** Spatial alignment plus a guide line conveys the binding, so the stored excerpt is surfaced only for **orphaned** comments (their lost context). It is still derived live from the block opening and frozen when the block disappears.
- **In vim mode the marker is fully hidden** (a dot cue; raw `<!--c:ID-->` only behind a "show source" toggle), superseding ADR 0007's reveal-the-raw-marker-on-the-cursor-line behaviour. The clutter cost of the in-body marker is paid down in the rendering, not by changing the anchor.

## Out of scope / deferred

- **Document-side padding** (pushing paragraphs down for long comments) — its own later phase; margin-side padding ships first.
- **Word/span-level anchoring** — still deferred (ADR 0007). The per-paragraph slot is the unit; sub-block precision is not introduced here.
