# Spec Drafts

**Status**: Drafts index
**Last updated**: 2026-07-15

---

## What this file is

A parking lot for feature ideas that warrant their own spec — but are not yet ready for one. Each entry below is a stub: title, one-sentence hook, related existing specs, and a few initial questions to seed the eventual spec conversation.

When an entry graduates, it becomes its own `specifications/<slug>.md` and its stub is removed from here.

This file is not a roadmap. Entries are not prioritized; ordering is rough.

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
- Does this overlap with the action log (which captures _what happened_) — or is this distinct (_what to do next_)?
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

## Novel-scale preview rendering (pagination / chapter-style)

**Why:** Preview and import now render the entire assembled document in a single read-only Tiptap/ProseMirror instance. ProseMirror does not virtualize, so a novel-sized sequence (100k+ words) lives in the DOM at once — a real risk of stutter on scroll/render that has not yet been validated at scale. Rather than holding the whole document live, a "paginated" or chapter-style rendering could render only the visible/nearby slice, keeping the surface responsive regardless of manuscript length.

**Related specs:** `preview.md`, `export.md`; see also `references/adr/0003-preview-anchor-sentinels.md` and the novel-scale risk + static-HTML fallback in `references/suggestions.md`.

**Initial questions:**

- What's the unit of pagination — section/chapter (natural, sequence-derived), a fixed word/block budget, or viewport-driven windowing (render slices around the scroll position)?
- Does the exporter need to emit slice boundaries (e.g. per-section markdown chunks) so the frontend can lazily render/mount them, or does the frontend slice a single markdown string client-side?
- How do sidebar anchors and `getElementById('fragment-<id>')` scrolling work when the target slice isn't mounted yet — pre-mount on navigation, or keep a lightweight always-present anchor map?
- Interaction with browser-native Cmd+F (a deliberate non-feature to replace): windowing breaks find-in-page for unmounted content. Acceptable, or a blocker?
- Is the deferred static-HTML-from-the-same-Tiptap-schema fallback (`generateHTML(doc, sharedExtensions)`) the cheaper first move before true pagination — measure first, then decide?
- Does chapter-style rendering bleed into a reading/navigation UX (prev/next chapter, "you are here") or stay a pure performance optimization invisible to the user?

---

## Mermaid rendering for visualizations in Obsidian

**Why:** Maskor's overview surfaces arcs and sequence shape visually — but the same project, viewed in Obsidian, has none of it. Embedding mermaid (or another markdown-native diagram syntax) into project notes or generated summary files would let the visual content survive outside Maskor.

**Related specs:** `overview.md`, `export.md`, possibly a new "obsidian-bridge" spec.

**Initial questions:**

- Generated on demand (export step) or live-maintained as a project artifact?
- What's the source artifact — a generated note, a sidecar file, embedded in fragment frontmatter?
- Which visualizations are mermaid-expressible (arc curves are mostly not), and which need a fallback?
- Does this open a broader "Maskor as an Obsidian plugin" question, or stay strictly export-side? (That broader question graduated to its own spec: `specifications/obsidian-port.md`.)
