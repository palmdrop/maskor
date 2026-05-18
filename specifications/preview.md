# Spec: Preview

**Status**: Partial
**Last updated**: 2026-05-18
**Shipped**: Read-only preview page with sequence picker, fragment title / section heading / separator toggles, sidebar fragment navigator, and prose renderer — see `references/plans/preview-feature.md` (phases 1–5).

---

## Outcome

The user can open a preview surface that shows any sequence as a continuously readable document — fragments assembled in order, rendered as prose. The user reaches for preview when they want to read their own work end-to-end, when they want to inspect a sequence before exporting, and (in the future) when they want to inspect the contents of a draft.

Preview is a reading surface, not an editing surface. A sidebar lists the fragments for navigation; the rendered prose itself is read-only. Three toggles control how the prose is assembled — fragment titles, section headings, and the separator between fragments — with state persisted per project.

---

## Scope

### In scope

- A preview page that renders any sequence as assembled prose
- Sequence selection via a picker (default main, context-aware when entered from a specific sequence)
- Toolbar with three assembly toggles: fragment titles, section headings, separator
- Toolbar state persisted in `project.json`, applied across sessions
- Sidebar listing fragments grouped by section; clicking scrolls the prose
- Stale-content indicator with manual refresh when the vault changes
- Subtle out-of-sequence badge when previewing the main sequence
- Empty-sequence and missing-sequence messages

### Out of scope

- File export (handled by `specifications/export.md`)
- In-prose interactivity (no click-to-edit, no inline comments, no annotations)
- In-app search within the preview (browser-native Cmd+F is the answer)
- Custom typography controls (uses project-wide editor config)
- Side-by-side comparison of sequences
- Auto-refresh on vault changes (deliberately user-driven)
- Multi-sequence preview (one sequence at a time)
- Preview of draft snapshots (deferred — see `specifications/drafting.md` and `references/SUGGESTIONS.md`)

> Preview is for reading. Anything that turns it into an editing or analysis surface is out of scope.

---

## Behavior

### Entering preview

The preview page is reachable from:

1. The global project navigation — opens preview with the main sequence selected.
2. A "Preview this sequence" affordance from any sequence editor — opens preview with that sequence selected.
3. The export flow (future) — uses the same preview surface as its pre-save inspection step.

Selection is driven by the URL (`/projects/:projectId/preview?sequence=<uuid>`). When no sequence is specified, the main sequence is used. The sidebar picker reflects and changes the selection.

### Assembly

Sequence assembly happens server-side via the `@maskor/exporter` package — the same code path as file export. The frontend calls a preview endpoint with the current sequence; the backend returns a structured `AssembledSequence` payload (sections → fragments with content and stable uuids). The frontend renders this payload directly: fragment content via a static markdown renderer, anchors via per-fragment wrapper divs, with toggle state controlling section/title visibility and the inter-fragment separator. Typography uses project settings from `useProjectEditorConfig`.

Assembly is deterministic: the same sequence always produces the same `AssembledSequence`, regardless of whether the consumer is preview or export. The structured payload is the shared contract; preview and export each apply their own toggle-driven presentation on top.

### Toolbar

A compact inline toolbar above the preview area, with:

- **Sequence picker** (hidden when the project has only one sequence)
- **Fragment titles** toggle
- **Section headings** toggle (auto-hidden when the sequence has no named sections)
- **Separator** picker: `blank line` / `horizontal rule` / `none`
- **Refresh** button (visible when the preview is stale, see below)

Toggle changes refetch the preview immediately. Toolbar state persists in `project.json` under a `preview` key and re-hydrates on every visit.

### Sidebar

A sidebar to the left of the prose lists fragments in the order they appear in the sequence, grouped by section. The sidebar is navigation: clicking a fragment scrolls the prose to that fragment using stable DOM anchors emitted by the backend during assembly.

The sidebar always groups by section, regardless of the section-heading prose toggle. Section grouping is for navigation; the toggle is for presentation.

### Defaults

When no `preview` config exists in `project.json`:

- `showTitles`: `false` — titles break reading flow; opt in only.
- `showSectionHeadings`: `true` — section context aids orientation.
- `separator`: `blank-line` — natural prose rhythm.

### Stale-content indicator

The preview page subscribes to vault SSE events. When any fragment, aspect, or sequence change is observed, the preview is flagged stale and a subtle banner appears with a "Refresh" button. The user chooses when to apply the update. Toggle flips always apply immediately and are not gated by staleness.

The stale check is conservative — any vault change triggers it. Computing "is this change relevant to the previewed sequence?" client-side costs more than the occasional irrelevant refresh prompt.

### Out-of-sequence badge

When previewing the **main** sequence, a small badge in the toolbar shows the count of fragments not placed anywhere in main (e.g., `12 not in main`). The badge is informational; clicking it is a fast-follow for a future enhancement.

For alternate sequences, the badge is hidden — fragments not in an alternate sequence is the rule, not an exception.

### Empty and missing states

- **Empty sequence** (zero fragments placed): the prose area shows `Sequence empty.` The sidebar shows no fragments. Toggles remain interactive.
- **Missing sequence** (the selected sequence no longer exists, detected on refresh): the prose area shows `This sequence no longer exists.` The picker reverts to the main sequence on the next user action.

---

## Constraints

- Preview is read-only. It never modifies vault files, the DB, sequences, or any other project state.
- Assembly logic lives in `@maskor/exporter` — single source of truth shared with export.
- Toolbar state is project-scoped, stored in `project.json` under `preview`. Not stored in the URL, not stored globally.
- Fragment content in the preview is rendered via a lightweight static markdown component (`StaticMarkdown`), not via a per-fragment Tiptap editor — preview is read-only and editor instances per fragment would blow up at novel-sized sequences. The `ReadonlyEditor` Tiptap wrapper remains for the import flow, where only one instance renders the entire preview.
- Anchors used for sidebar navigation are stable DOM ids (`fragment-<uuid>`) emitted by the frontend around each rendered fragment, not derived through text matching.
- Updates are user-driven via the refresh banner — preview never auto-reflows during reading.

---

## Prior decisions

- **Preview is a first-class feature, not an export side-effect**: The user's primary use case is reading their own work in sequence, not previewing the artifact of an export. Treating preview as just "the screen before save" understates the feature. Export becomes one consumer of preview, not its parent.
- **Backend assembly, shared with export**: The exporter is the source of truth for how a sequence becomes prose. Frontend assembly would duplicate the logic and risk preview-vs-export drift over time.
- **Stale indicator over auto-refresh**: Auto-refreshing the preview while the user is reading would reflow paragraphs underfoot. The stale indicator informs the user without disrupting reading; manual refresh respects the reading flow.
- **Any sequence is previewable**: The "main" flag on sequences is just metadata. Designing preview as main-only would force a redesign once the secondary-sequences work lands. Cost of supporting all sequences is one picker.
- **Read-only with sidebar navigation**: Clicking in the prose is out of scope; the sidebar provides navigation without compromising the reading surface. Search is browser-native.
- **Sidebar grouping is decoupled from prose toggles**: The sidebar is a navigation TOC; toggles are presentation. Section grouping in the sidebar persists regardless of the section-heading prose toggle.
- **Toggle state persists in `project.json`**: Writers form preferences. URL params or in-memory state would force re-configuration each session. Storing per-project (not per-sequence) keeps the model simple.
- **Out-of-sequence badge for main only**: For alternate sequences, partial placement is normal. The badge would create noise.
- **Static markdown for preview, Tiptap for import**: Preview is pure reading — a single Tiptap editor per fragment would create hundreds of editor instances for a novel-sized sequence. The preview uses `StaticMarkdown` (markdown-it → HTML, no editor) per fragment instead. Import's preview keeps `ReadonlyEditor` (one instance, full content) because it shows "what will be created from this file" in a single blob.

---

## Open questions

- [ ] 2026-05-18 — Should the out-of-sequence badge be clickable in v1 (linking to a filter view in the sequencer) or purely informational? Defer until the sequencer view supports such a filter.
- [ ] 2026-05-18 — Should the sidebar show fragment counts per section (e.g. `Chapter 1 (8)`) when the sequence has many sections? Useful for orientation but adds visual weight.
- [ ] 2026-05-18 — Should the preview page support keyboard shortcuts for sidebar navigation (j/k or arrows)? Worth considering once basic preview is shipped.
- [ ] 2026-05-18 — Click-to-edit-fragment in the prose is deferred — when re-evaluating, decide whether anchor IDs from assembly are sufficient or if a richer per-fragment wrapper is needed.

---

## Acceptance criteria

- Opening preview with no explicit sequence shows the main sequence.
- Opening preview from a sequence editor pre-selects that sequence.
- The toolbar exposes exactly three assembly controls (titles, section headings, separator), plus the sequence picker.
- Flipping any toggle refetches and re-renders the preview within ~250ms on a typical sequence.
- Toolbar state persists across sessions via `project.json` and re-hydrates on page load.
- The sidebar lists every fragment in the selected sequence, grouped by section.
- Clicking a sidebar entry scrolls the prose to the corresponding fragment via the anchor emitted by the backend (not by text-content matching).
- Vault changes do not auto-reflow the preview — they only flag it stale.
- Refresh applies pending changes without losing the current toolbar configuration.
- Previewing the main sequence shows a badge with the count of fragments not placed in main; previewing any other sequence hides the badge.
- An empty sequence renders the `Sequence empty.` message; a deleted sequence renders the `This sequence no longer exists.` message on the next refresh.
- The preview never writes to the vault or DB. Repeated preview operations produce no log entries.
- Preview and export operate on the same `AssembledSequence` payload produced by `@maskor/exporter` for a given sequence — divergence in rendered output is a presentation-layer concern, never an assembly-layer one.
