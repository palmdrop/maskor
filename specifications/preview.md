# Spec: Preview

**Status**: Partial
**Last updated**: 2026-06-11
**Shipped**:

- Read-only preview page with sequence picker, fragment title / section heading / separator toggles, sidebar fragment navigator, and prose renderer — see `references/plans/preview-feature.md` (phases 1–5).
- 2026-05-30 — Rendering refactor: preview and import render through one shared read-only Tiptap renderer fed by a complete server-assembled **markdown string** from `@maskor/exporter`. Toggles apply server-side (sent as request options); sidebar navigation uses invisible anchor sentinels (a custom markdown-it rule + schema-modeled Tiptap node rendering `id="fragment-<id>"`, `html` stays `false`). `StaticMarkdown` / `dangerouslySetInnerHTML` removed. (plan: `references/plans/preview-import-shared-renderer.md`)
- 2026-05-31 — Preview and import share one `FragmentNavSidebar` component and one `useFragmentAnchor` hook. The active fragment lives in the URL hash (`#fragment-<id>`) — the native browser anchor token, so a preview anchor is shareable and restored on reload; the hook scrolls once the assembled markdown has rendered (covering the async-fetch gap the router's native hash scroll cannot). Sidebar rows highlight the active fragment via `aria-current`. The per-page sidebar duplicates (`PreviewSidebar`, the import inline `<aside>`, and the `scrollToPiece` helper) are removed.
- 2026-06-01 — The shared `assembleMarkdown` path strips Margin anchor markers (`<!--c:ID-->`) from fragment bodies, so the preview surface never shows them. (plan: `references/plans/margins.md`, Phase 2b)
- 2026-06-09 — Export button in the preview toolbar. Clicking "Export" opens the Export modal pre-selected to the active preview sequence. The modal is also reachable via the command palette "Export…" command. (plan: `references/plans/export-feature.md`)
- 2026-06-08 — Double-click inline editing: double-clicking a fragment in the Preview page opens an `InlineFragmentEditor` in place (vim/rich/raw per the global setting). The assembled markdown is split at the fragment's anchor sentinel; a `ReadonlyProse before` / `InlineFragmentEditor` / `ReadonlyProse after` triptych replaces the single renderer while editing. The editor is seeded from the raw fragment body (separate `useGetFragment` fetch — not from the assembled markdown). Save calls `useUpdateFragment`, invalidates the assembled sequence and fragment query keys, and re-scrolls to the anchor. Margin-comment anchors (`<!--c:ID-->`) are preserved verbatim through the round-trip. (plan: `references/plans/preview-inline-fragment-editing.md`)
- 2026-06-11 — Active-fragment tracking is now a position-based scroll spy (`useScrollSpy`): the active fragment is the one whose anchor sits at a reading line ~35% down the viewport, computed from anchor positions rather than enter-only `IntersectionObserver` events. This tracks both scroll directions (a long fragment scrolled up into view becomes active) and resolves correctly after a reload's scroll restore (a programmatic scroll fires the same recompute). It drives the preview header title and the sidebar `aria-current` highlight, and the same hook now drives the import-preview sidebar highlight on scroll. (plan: `references/plans/overview-scroll-list-sort-and-panel-excerpt.md`)

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
- In-prose annotations or inline comments
- In-app search within the preview (browser-native Cmd+F is the answer)
- Custom typography controls (uses project-wide editor config)
- Side-by-side comparison of sequences
- Auto-refresh on vault changes (deliberately user-driven)
- Multi-sequence preview (one sequence at a time)
- Preview of draft snapshots (deferred — see `specifications/drafting.md` and `references/suggestions.md`)
- Metadata editing from preview (body-only; full editor is at the fragment editor page)
- Swap-recovery and extract/insert from the inline preview editor (accepted tradeoff vs the full `EntityEditorShell`)

---

## Behavior

### Entering preview

The preview page is reachable from:

1. The global project navigation — opens preview with the main sequence selected.
2. A "Preview this sequence" affordance from any sequence editor — opens preview with that sequence selected.
3. The export flow (future) — uses the same preview surface as its pre-save inspection step.

Selection is driven by the URL (`/projects/:projectId/preview?sequence=<uuid>`). When no sequence is specified, the main sequence is used. The sidebar picker reflects and changes the selection.

### Assembly

Sequence assembly happens server-side via the `@maskor/exporter` package — the same code path as file export. The frontend calls a preview endpoint with the current sequence **and the toggle options** (titles, section headings, separator); the backend assembles the sequence into a complete **markdown string** with those options already applied, plus a lean navigation payload (`sections → fragments` with stable uuids and display keys, **no content**). The response shape is `{ markdown, sections }`. The frontend renders `markdown` through the shared read-only Tiptap renderer; the `sections` drive the sidebar. Typography uses project settings from `useProjectEditorConfig`.

Anchors for sidebar navigation are emitted inline in the markdown as collision-safe sentinel tokens (off for file export, on for preview/import). A custom markdown-it rule maps each sentinel to an invisible, schema-modeled Tiptap node rendering `id="fragment-<uuid>"`. `html` stays `false` everywhere.

Assembly is deterministic: the same sequence and options always produce the same markdown, regardless of whether the consumer is preview or export. The exporter is the shared contract; the only byte difference between a preview document and an exported file is the anchor sentinels.

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
- The entire assembled document renders in a **single** read-only Tiptap instance shared with the import flow — not per-fragment renderers. One instance avoids the per-fragment editor explosion the original design feared; novel-scale rendering (one ProseMirror instance holding 100k+ words, no virtualization) is the tracked risk, with a static-HTML-from-the-same-schema fallback in `references/suggestions.md`.
- Anchors used for sidebar navigation are stable DOM ids (`fragment-<uuid>`) produced by the exporter's anchor sentinels and a schema-modeled Tiptap node, not derived through text matching.
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
- **One shared read-only Tiptap renderer for preview and import** (supersedes the earlier "static markdown for preview, Tiptap for import" split): the original concern was per-fragment editor instances exploding at novel scale. Assembling the whole sequence into a single markdown string server-side means the preview is one Tiptap instance, not hundreds — so preview and import can share the exact same renderer and config (no drift), and `dangerouslySetInnerHTML` is removed entirely. Anchors move to exporter-emitted sentinels + a Tiptap node rather than frontend wrapper divs. See `references/adr/0003-preview-anchor-sentinels.md`.
- **Toggles apply server-side**: assembly options (titles, section headings, separator) are sent to the preview endpoint and applied by `@maskor/exporter`, not re-applied as JSX presentation on the client. Flipping a toggle refetches. This keeps preview byte-aligned with file export and removes a second, divergent assembly path on the frontend.

---

## Open questions

- [ ] 2026-05-18 — Should the out-of-sequence badge be clickable in v1 (linking to a filter view in the sequencer) or purely informational? Defer until the sequencer view supports such a filter.
- [ ] 2026-05-18 — Should the sidebar show fragment counts per section (e.g. `Chapter 1 (8)`) when the sequence has many sections? Useful for orientation but adds visual weight.
- [ ] 2026-05-18 — Should the preview page support keyboard shortcuts for sidebar navigation (j/k or arrows)? Worth considering once basic preview is shipped.
- [ ] 2026-05-18 — Click-to-edit-fragment in the prose is deferred — when re-evaluating, decide whether anchor IDs from assembly are sufficient or if a richer per-fragment wrapper is needed.
- [ ] 2026-05-30 — Novel-scale rendering: the planned shared read-only Tiptap renderer holds the entire assembled sequence in one ProseMirror instance (no virtualization). Validate at 100k+ words; fall back to static HTML generated from the same Tiptap schema if the live instance is too heavy. See `references/suggestions.md`.

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
- Preview and export assemble through the same `@maskor/exporter` core for a given sequence and options; the preview wire payload is `{ markdown, sections }` (the markdown is the assembled document, the sections are lean navigation only). The sole byte difference between preview markdown and an exported file is the anchor sentinels (`includeAnchors`).
