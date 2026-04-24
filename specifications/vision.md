# Maskor — Vision

**Status**: Stable
**Last updated**: 22-04-2026

---

## What is maskor?

Maskor is a tool for fragmented writing styles. Maskor is there to manage, overview and arrange fragments (i.e, a small chunk of writing). Maskor provides a way to manage and edit discrete fragment, assign metadata, monitor the development of multiple simultaneous arcs and developments, and overview how different _aspects_ of the writing projects interact, mix together, and relate.

Many writers use a fragmented style, both during writing and in the final work. However, it is often difficult to get an overview of how well-placed each fragment is. Maskor gives a visual graph-like overview where different story arcs, aspects, themes, etc, are displayed visually alongside a global sequence line.

The sequence is the final order of the fragments. The "sequence" naming is deliberately distinct from the classical "timeline" concept: maskor can be used for linear writing, but arranging fragments in linear time is not a must for any writing project.

## The user

A writer working on a large, complex project — novel, screenplay, essay collection, non-linear narrative.

---

## The problem

Large writing projects are hard to manage linearly. Traditional tools force structure too early. Writers end up with disconnected notes, no coherent way to arrange them, and no visibility into thematic shape.

Maskor alleviates this by managing fragments for discrete editing, helps with arranging, and most importantly, gives a thematic overview.

---

## What Maskor does

Maskor lets you write in fragments, assign thematic dimensions (aspects) to each fragment, then use an arc-guided sequencer to find the order.

**Input:** Disconnected prose fragments, written in Obsidian or imported from external files.

**Process:** Tag fragments with aspects and intensities → define how those aspects rise and fall (arcs) → let the sequencer propose or derive an order → accept, reject, or adjust. Maskor can propose an order, or the user can choose to manually arrange all fragments.

**Output:** A sequenced manuscript, exportable to text, PDF, or Word.

---

## Core workflow

1. Write fragments freely, without worrying about order
2. Tag each fragment with aspects (characters, themes, places, etc.) and intensities
3. Define arcs — how each aspect should rise and fall across the whole
4. Optionally setup an "interleaving", specifying how different arcs should interact.
5. Run the sequencer — manually, semi-randomly, or automatically
6. Review the sequence in the overview
7. Export

---

## Design philosophy

- Fragment-first: order is derived, not imposed
- Embraces randomness and unexpected pairings
- Markdown files as source of truth — human-readable, survives tool changes
- Local-first: no server, no account, no cloud dependency

---

## What Maskor is NOT

- Not a word processor — content is written in Markdown or using the web editor. Complex formatting is the job of other software.
- Not an outliner — structure emerges from sequencing, not hierarchy
- Not Scrivener — less manual, more arc-driven
- Not a publishing tool — export is the end of Maskor's responsibility
- Not an AI tool - Maskor does not use LLMs to analyze the users writing. The sequencing is deterministic and reproducible.

---

## Minimal viable workflow

1. Import raw pieces of writing into Maskor
2. Edit fragments independently.
3. Assign aspects.
4. Sequence fragments manually.
5. Overview the ordering using a graph view that visualizes how aspect change throughout the sequence.
6. Export to a single file.

For the minimal workflow, arcs, interleaving, automatic sequencing, is not necessary.
