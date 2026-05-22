# Spec Drafts

**Status**: Drafts index
**Last updated**: 2026-05-22

---

## What this file is

A parking lot for feature ideas that warrant their own spec — but are not yet ready for one. Each entry below is a stub: title, one-sentence hook, related existing specs, and a few initial questions to seed the eventual spec conversation.

When an entry graduates, it becomes its own `specifications/<slug>.md` and its stub is removed from here.

This file is not a roadmap. Entries are not prioritized; ordering is rough.

---

## Quick-switching / entity quick-open

**Why:** A writer working across many fragments, notes, and references needs a single fast surface to jump between them. Today the only ways to open an entity are the fragment list view, an overview tile, or the prompting flow. Named as a planned sibling spec in `command-palette.md` (the `Cmd/Ctrl+O` quick-open) but not yet specced in its own right.

**Related specs:** `command-palette.md`, `navigation.md`

**Initial questions:**

- Single entity type per session, or unified (fragments + notes + refs + aspects + projects)?
- Same `Picker` primitive as the palette, or a distinct surface?
- Recency / pinning support, or strictly fuzzy-search?
- Does opening an entity replace the current editor, or compose with [[tabs / multiple open editors]]?

---

## Tabs / multiple open editors

**Why:** A writer often needs two fragments visible at once (cross-reference, transcribe across) or wants to return to where they left off after a detour. Today the editor is single-document; navigating away loses position and forces a re-open.

**Related specs:** `navigation.md`, `fragment-editor.md`, `command-palette.md`, [[quick-switching / entity quick-open]]

**Initial questions:**

- Tabs (browser-style) or split-pane (two editors side by side), or both?
- Persist the open tab set across sessions?
- How does the unsaved-changes prompt (from `navigation.md`) compose with tab close vs. window close?
- Per-project tab state, or global across the app?
- Does this subsume the prompting-mechanism "next fragment" surface, or stay independent?

---

## Pieces removal refactor

**Why:** The `pieces/` drop zone is a transient filesystem bypass that has accumulated its own concept, UI, and lifecycle. `_glossary.md` flags Piece as "likely to be removed in a future iteration." Proposal: drop a partial-data file directly into `fragments/`, and let Maskor auto-fill missing metadata (UUID, timestamps, frontmatter) on watcher pickup.

**Related specs:** `fragment-model.md`, `import-pipeline.md`, `_glossary.md`, `storage-sync.md`

**Initial questions:**

- What is the minimum file shape that auto-promotes to a Fragment? (Body only? Body + key from filename?)
- How does this interact with the importer, which also produces fragments from external files?
- Migration path for the existing `pieces/` folder and any in-flight pieces — drain on upgrade?
- Does the `piece` term and its UI surface disappear entirely, or stay as a label for "fragments awaiting first save"?
- All glossary mentions and spec references need a coordinated sweep.

---

## File auto-metadata & importing capabilities

**Why:** Today a file dropped into `fragments/`, `notes/`, etc. without proper frontmatter does not become a first-class entity. Proposal: any file in a recognized folder that is missing metadata or UUID gets auto-completed on watcher pickup. Enables drag-and-drop from another project's vault as a poor-man's import.

**Related specs:** `import-pipeline.md`, `fragment-model.md`, `attachments.md`, `storage-sync.md`

**Initial questions:**

- Which folders are eligible for auto-metadata (fragments, aspects, notes, references — all four)?
- Conflict resolution if the file already has a UUID that collides with an existing entity?
- How does this overlap with the existing import pipeline — is import still a distinct flow, or does it dissolve into "just drop the file in the right folder"?
- Does this enable a real cross-project import (drag from one vault to another and have Maskor reconcile)?
- Related to [[pieces removal refactor]] — both touch the "file shape that auto-promotes" question.

---

## Inspiration manager

**Why:** A writer collects visual references — images, screenshots, mood-board fragments — alongside their text work. Today there's no surface for this. Could be a floating panel of pinned images over the project, or could be a separate app entirely (digital are.na frame).

**Related specs:** none yet; would touch `project-config.md` and possibly a new attachments-extension spec.

**Initial questions:**

- Inside Maskor (a new panel / view) or a separate companion app?
- If inside Maskor: storage location (vault folder?), attachment model (per-fragment? project-level?), display surface (floating overlay? sidebar? dedicated route?).
- If separate: what's the integration contract — does Maskor read from it, link to it, or stay agnostic?
- Pinboard-style (free-positioning) or grid-style (auto-layout)?
- Defer until the use case is clearer; this may stay an exploratory note for a long time.

---

## In-project TODO / idea tracking

**Why:** A writer wants to capture project-specific TODOs, future ideas, and unresolved questions without leaving Maskor — and have them surface in the right context (next to the relevant fragment, in a dedicated view, etc.).

**Related specs:** `notes.md`, `attachments.md`, possibly a new spec.

**Initial questions:**

- Is this a new entity type, or are notes (per `notes.md`) sufficient with a `kind: 'todo'` convention?
- If new: lifecycle (open / resolved / archived), surfacing (dedicated view, fragment-attached, both)?
- Does this overlap with the action log (which captures *what happened*) — or is this distinct (*what to do next*)?
- Related to [[stub fragments]]; both deal with deferred content.

---

## Stub fragments

**Why:** A writer wants to leave a placeholder for "a scene that should go here" without writing it yet — a stub fragment that occupies a sequence position and can be filled in later. Different from low-readiness; closer to "intentionally empty."

**Related specs:** `fragment-model.md`, `prompting.md`, `overview.md`

**Initial questions:**

- New fragment kind, or a flag on the existing fragment model (`isStub: true`)?
- Do stub fragments appear in the suggestion mode's eligible pool, or are they excluded until promoted?
- Visual distinction in the overview (placeholder tile)?
- Promotion path: writing into a stub flips it to a normal fragment automatically?
- Related to [[in-project TODO / idea tracking]]; both deal with deferred content.

---

## Pin fragment for continuous writing

**Why:** Early in a fragment's life, a writer wants to keep coming back to the *same* fragment across sessions instead of being prompted with a different one each time. Today the prompting mechanism surfaces a new fragment after each save; there's no "stay on this one" signal.

**Related specs:** `prompting.md`, `fragment-editor.md`, `navigation.md`

**Initial questions:**

- Is "pinned" a property of the fragment, of the session, or of the user's last-edited state?
- How does pinning interact with `readyStatus` and the suggestion-mode eligible pool — does a pinned fragment still respect cooldown?
- Could this be subsumed by "Maskor remembers where you were working last and returns you there" (no explicit pin), or is the explicit signal valuable?
- Visual indicator that a fragment is pinned?
- Unpin on what trigger — explicit user action, hitting `readyStatus === 1.0`, manual save-and-next?

---

## Mermaid rendering for visualizations in Obsidian

**Why:** Maskor's overview surfaces arcs and sequence shape visually — but the same project, viewed in Obsidian, has none of it. Embedding mermaid (or another markdown-native diagram syntax) into project notes or generated summary files would let the visual content survive outside Maskor.

**Related specs:** `overview.md`, `export.md`, possibly a new "obsidian-bridge" spec.

**Initial questions:**

- Generated on demand (export step) or live-maintained as a project artifact?
- What's the source artifact — a generated note, a sidecar file, embedded in fragment frontmatter?
- Which visualizations are mermaid-expressible (arc curves are mostly not), and which need a fallback?
- Does this open a broader "Maskor as an Obsidian plugin" question, or stay strictly export-side?
