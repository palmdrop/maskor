# Overview renders prose client-side per-fragment; Preview stays server-assembled

**Status**: accepted — depends on `references/adr/0010-overview-vertical-read-reorder-surface-with-arc-overlay.md`. Affects `specifications/sequencer.md` (new per-fragment bulk-content endpoint) and the **Preview** entry in `specifications/_glossary.md` (unchanged, clarified as the export-authoritative renderer).

The redesigned Overview shows a sequence as flowing prose that must reorder smoothly with optimistic updates. The existing Preview obtains its prose from a server-side assembly roundtrip (`useGetAssembledSequence`) that returns one markdown blob — fine for read-only viewing, but it has no per-fragment seams to re-stitch, so any reorder would require a refetch and lose optimism. We therefore add a **per-fragment bulk-content endpoint** (a sequence as an ordered list of `{ fragmentUuid, key, markdown }`), render the spine as a **stack of per-fragment renderers using one shared component**, reorder the array **optimistically in the client**, and commit each move to the backend immediately (backend remains source of truth; roll back on error). Preview is left untouched as the server-assembled, export-authoritative renderer.

## Why

- **Optimism requires client-held chunks.** Reflowing prose before the backend responds is only possible if the client already holds each fragment's content as a separate unit. The assembled blob cannot be reordered client-side; per-fragment chunks can.
- **Per-fragment unlocks edit-from-context.** Each rendered chunk knows its `fragmentUuid`, so a future select-to-edit affordance (Phase 4) can map a selection back to a fragment — impossible against an anonymous assembled blob.
- **One shared renderer keeps entities composable.** The same component renders a spine fragment, the selected pool fragment in the right panel, and (later) any other place a fragment is shown beyond an excerpt — laying groundwork for the future canvas graph view without building canvas infrastructure now.

## Trade-off accepted

- **Two prose renderers exist** (client per-fragment stack for the working surface; server whole-doc assembly for Preview/export). They can disagree visually — separators, section headings, title visibility — because the working surface concatenates chunks with a plain fixed style rather than honoring every export toggle. This **rendering drift is accepted**: the working surface is for reading-while-working, and **Preview remains the authoritative "this is what export looks like" surface**. The user checks Preview before export. Sharing the assembly rules across client and server (to eliminate drift) was rejected for Phase 1 as premature coupling; revisit if the divergence proves confusing.
