# Spec: Obsidian Port & Maskor Package

**Status**: Draft
**Last updated**: 2026-07-15
**Shipped**:

---

## Outcome

Maskor is delivered as an installable **Obsidian package**: a vault template plus a curated set of plugins (community + bespoke) that recreates the maskor workflow inside Obsidian. A writer runs one command (or installs one plugin) and gets a ready maskor project vault — folder scaffold, layout, plugin set, and configuration — with the arc-graph overview, sequencer, and prompting available as custom views. The standalone client/server app is superseded for local use.

---

## Scope

### In scope

- A **vault template package** (e.g. `packages/obsidian-vault-template/`): the maskor project scaffold (`fragments/`, `aspects/`, `notes/`, `references/`, `.maskor/`) plus a complete `.obsidian/` profile — layout, enabled-plugin list, per-plugin `data.json` configs, hotkeys, appearance, CSS snippets — all as version-controlled JSON. Single source of truth for both installers below.
- A **scaffolder CLI** (`create-maskor-vault`, bun) that stamps out a new vault from the template, with companion plugins vendored at pinned versions.
- A **bespoke `maskor-core` plugin**: aspect weights UI, sequence file model, the arc-graph overview as a custom `ItemView`, sequencer commands (shuffle, constraints, fitting score), and the **composable canvas view** (see Behavior) as a second custom `ItemView`. Doubles as **vault doctor**: on load it verifies the companion plugin set, offers (with consent) to install/enable missing ones, and seeds the layout on first run.
- Native-Canvas **projection commands**: "Sequence → Canvas" (generate a `.canvas` file from a sequence — file nodes in reading order, edges for order, groups for sections) and "Canvas → Sequence" (derive an inactive candidate sequence from a canvas's edge chain or layout). Projections only — sequences stay the source of truth; generated canvases carry no round-trip guarantees.
- A **bespoke `maskor-prompting` plugin**: weighted non-deterministic fragment surfacing with cooldown/avoidance stats (port of `prompting.md`).
- Reuse of the runtime-agnostic pure-TS packages: `@maskor/sequencer`, `@maskor/shared`, `@maskor/importer`, `@maskor/exporter` (kept for export — Word comments/footnotes are not covered by any community plugin).
- A curated **community plugin set** covering replaced Maskor surface (see Behavior).
- A "Restore maskor defaults" command (re-seed layout/configs deliberately).

### Out of scope

- Cloud deployment, accounts, sync (Obsidian Sync is the user's own choice).
- Listing in the official community plugin store (initially; distribution is template vault + [BRAT](https://github.com/TfTHacker/obsidian42-brat)).
- Porting the standalone app's client/server/cache infrastructure — the port's point is that this layer disappears.
- Porting surfaces Obsidian core already provides: editor (CM6 + vim), quick-switcher, command palette, links/backlinks/rename cascade, external-change watching, tabs, full-text search, spell check.
- Auto-updating vendored plugins silently; updates go through BRAT/store with user consent.
- Patching Obsidian's Canvas internals (Advanced Canvas-style monkey-patching). There is still no official Canvas runtime API (2026); maskor never depends on patched internals for core workflow. Consuming events *exposed by* [Advanced Canvas](https://github.com/Developer-Mike/obsidian-advanced-canvas) when it happens to be installed is permitted garnish, nothing more.

---

## Behavior

### Replaced by Obsidian core

`fragment-editor.md`, `navigation.md`, `quick-switcher.md`, `command-palette.md`, `document-links.md`, `storage-sync.md` (Vault + MetadataCache), `notes.md`/`references.md`/`attachments.md` (folders + Properties + backlinks). `extract-selection.md` maps near-1:1 to the core [Note Composer](https://help.obsidian.md/plugins/note-composer) plugin.

### Replaced or approximated by community plugins

| Maskor spec | Plugin | Fit |
| --- | --- | --- |
| `sequencer.md` (manual arrangement, sections) | [Longform](https://github.com/kevboh/longform) | Scenes tab with drag-and-drop reorder, folder nesting ≈ sections. Manual ordering only. |
| `export.md`, `preview.md` | Longform Compile + [Pandoc](https://github.com/OliverBalfour/obsidian-pandoc) / [Enhancing Export](https://github.com/mokeyish/obsidian-enhancing-export) | Assembly + docx. No annotation export — `@maskor/exporter` stays for that. |
| `import-pipeline.md` | Pandoc (docx→md) + [Note Refactor](https://github.com/lynchjames/note-refactor-obsidian) | Split-by-heading; no preview/review step. |
| `fragment-split.md` | Note Refactor | No thematic-break/blank-line modes, piece preview/rename, or sequence insertion. |
| `margins.md` | [Document Comments](https://community.obsidian.md/plugins/document-comments) | Margin cards anchored via `<!--c:ID-->` HTML markers — the same on-disk mechanism as Maskor's Margin (ADR 0009); data likely near-compatible. Young plugin (v0.1.x, 2026-06). Fallbacks: [Side Comments](https://community.obsidian.md/plugins/side-comments), [Sidenotes](https://forum.obsidian.md/t/plugin-sidenotes/110632), [Note Annotations](https://community.obsidian.md/plugins/note-annotations). |
| `drafting.md` | Longform multi-drafts, [obsidian-git](https://github.com/Vinzent03/obsidian-git), core File Recovery | Good enough. |
| `project-statistics.md` | [Better Word Count](https://github.com/lukeleppan/better-word-count), [Vault Statistics](https://github.com/bkyle/obsidian-vault-statistics-plugin) | Good. |
| `action-log.md` | obsidian-git history | File-level diffs, not semantic entries; session undo/redo is core. Accepted loss. |

**[StoryLine](https://github.com/PixeroJan/obsidian-storyline)** (assessed 2026-07-15, v1.10.41) deserves its own note: a full book-planning suite that overlaps several rows at once. Drag-and-drop scene boards and a resequence command (`sequencer.md` manual arrangement), a Scrivenings-style Manuscript view with embedded per-scene editors (`preview.md`), scene split/merge, a six-stage status pipeline (≈ readyStatus), DOCX/PDF/MD export with configurable styles, stats with histograms, and view snapshots that capture scene ordering (partial `drafting.md`). It even plots a per-scene `intensity` frontmatter value (−10..+10) as a single tension curve over scene order — the nearest ecosystem cousin to the arc graph. Not adopted, for now: it is a competing whole-app data model rather than a composable plugin — ordering lives in per-scene `act`/`chapter`/`sequence` frontmatter (vs `.maskor/sequences/` files), its structure is book/act/chapter-shaped (`vision.md`: don't force structure early), and it is young (first release 2026-02, single developer, breakneck release cadence, distributed via PluginHub/manual install, not the official store). No sequencer assistance, no weighted aspects, no prompting, no annotation export. Re-evaluate at the sequence-arrangement decision point (Open questions).

### Genuinely new — the bespoke plugins

1. **Aspect-arc model + overview graph** (`aspect-arc-model.md`, `overview.md`): weighted aspect dimensions per fragment, actual-arc curves plotted against sequence order. The nearest ecosystem cousin is StoryLine's single hardcoded `intensity` field plotted as one tension curve; nothing plots multiple weighted aspect dimensions per fragment against sequence order, let alone target arcs. This is the product; it lives in `maskor-core` as a custom `ItemView`.
2. **Sequencer engine** (`fitting-score.md`, `interleaving.md`, shuffle/constraint DAG, secondary sequences): pure-TS port, commands + views in `maskor-core`.
3. **Prompting engine** (`prompting.md`): `maskor-prompting`. [Smart Random Note](https://github.com/erichalldev/obsidian-smart-random-note) is the weak cousin (random from search/tag; no weighting, cooldown, avoidance, nudges).
4. **Composable canvas view** (the `references/TODO.md` graph-view vision): a bespoke canvas `ItemView` in `maskor-core` — not native Canvas. A sequence is an ordered list with sections and constraints; native Canvas is an unordered 2D plane and cannot enforce ordering-as-position, host arc overlays, or carry maskor node semantics. The bespoke view provides:
   - **Sequence lanes**: fragments arranged in ordered lanes; drag-to-reorder writes back through `@maskor/sequencer` (the same pure ops the overview's reorder column uses).
   - **Arc overlay**: aspect arc curves drawn over the lane; readiness/aspect badges and constraint-violation cues on nodes.
   - **Edit and compare**: open fragments side by side within the view; in-place node editing if the (undocumented) editor-embedding path used by the [Kanban plugin](https://github.com/mgmeyers/obsidian-kanban) proves viable, click-to-open otherwise.
   - **Composability**: notes/references/aspects float beside fragments, connected by their existing `[[links]]`; focus/fade-out for concentrating on one fragment or sequence.
   Likely built on [React Flow (xyflow)](https://reactflow.dev/) or grown from the existing overview components; pan/zoom/selection are the cost of owning the surface. Native Canvas remains available for freeform spatial work via the projection commands (Scope). (open TODO items resolved natively)

From `references/TODO.md`: browser-style tabs ("use actual browser tabs"), quick-switching between fragments (core tabs + switcher), full-text fuzzy search across all entities (core search, or [Omnisearch](https://github.com/scambier/obsidian-omnisearch)), aspect folder overview with move-while-reading and attached-fragment counts (file explorer + backlink counts + split panes), per-entity cursor persistence ([Remember cursor position](https://github.com/dy-sh/obsidian-remember-cursor-position)), auto-linking aspect mentions while typing (completion/linkify-style plugins, e.g. [Various Complements](https://github.com/tadashi-aikawa/obsidian-various-complements-plugin)).

### Capability gaps — shipped Maskor features lost or degraded

The pure-TS engines (`importer`, `exporter`, `sequencer`) port intact; what does not carry over automatically is the UI and lifecycle built around them:

- **Semantic action log** (`action-log.md`): per-action entries with entity links, the history view, and session undo/redo of rearrangements are gone. obsidian-git gives file-level diffs; Longform gives 20-step reorder undo in its pane. Accepted loss unless `maskor-core` re-records its own actions.
- **Drafting** (`drafting.md`): named, atomic, full-project snapshots with entity counts and one-click restore (+ "save current first" safety net) degrade to git commits or Longform's folder-copy drafts.
- **Import pipeline UX** (`import-pipeline.md`): the splitting engine and smart delimiter detection port, but the full-page preview/review step, re-import warnings, byte-for-byte source archival, and import-sequence provenance need rebuilding in `maskor-core` — Note Refactor covers none of that.
- **Fragment split UX** (`fragment-split.md`): same shape — engine ports; the dialog (piece preview, rename-before-commit, heading stripping, split-into-sequence, Margin-comment migration) must be rebuilt or degrades to Note Refactor's heading split.
- **Preview surface** (`preview.md`): Longform Compile emits files; the closest community equivalent to the live assembled document with overlay editing is StoryLine's Manuscript view (embedded per-scene editors, cross-scene search/replace) — but it is welded to StoryLine's data model, so it does not compose with maskor sequences. Either a preview `ItemView` in `maskor-core` or an accepted loss.
- **Multi-sequence semantics** (`sequencer.md`): secondary sequences as ordering constraints, read-only import-sequences, clone/insert/merge, sections and multi-fragment section operations — Longform has one scene order per draft and cannot host any of this; it lives entirely in `maskor-core`.
- **Readiness-aware statistics** (`project-statistics.md`): word counts are covered; the readyStatus histogram/averages are Maskor concepts — a small stats surface in `maskor-core`, or a Dataview query snippet shipped in the vault template.
- **Margins polish** (`margins.md`): the block-aligned scroll-synced column, coupled fragment+Margin save, and orphan lifecycle degrade to Document Comments' behavior until adoption is verified.
- **Never-lose-writing machinery**: swap files, conflict banners, and buffer-authority guards become unnecessary (single process, direct file writes, core File Recovery) — a guarantee replaced by architecture, not a loss.

### Installation & configuration as code

Everything lives in plain JSON under the vault's `.obsidian/` (or a renamed config folder, e.g. `.maskor-obsidian/`, to avoid colliding with a user's personal profile):

- Layout: `workspace.json`, named layouts via the core Workspaces plugin.
- Plugin list: `community-plugins.json` + vendored `plugins/<id>/{main.js,manifest.json,styles.css}` at pinned versions.
- Per-plugin config: `plugins/<id>/data.json` (≈ today's `project.json`).
- Core settings/hotkeys/theme: `app.json`, `appearance.json`, `hotkeys.json`, `snippets/`.

**Hybrid install model**: the scaffolder CLI creates new vaults from the template; the `maskor-core` vault-doctor repairs/upgrades existing vaults (BRAT-style plugin fetch, consent-gated) and works where the CLI can't (mobile, adopted vaults). Both read the same template package.

**Seed, never clobber**: layout and settings are seeded on first run only. Obsidian rewrites `workspace.json` constantly — it is user state after seeding. Re-applying defaults is an explicit user command.

---

## Constraints

- Bespoke plugins avoid Node/Electron-only APIs where feasible (keeps Obsidian mobile open).
- No `bun:sqlite` in the Obsidian runtime — the SQLite index does not port (see Open questions).
- Unofficial APIs (`app.plugins` install/enable, workspace internals) are confined to the vault-doctor; the pure-file path (write JSON, prompt restart) is the fallback.
- Core packages (`sequencer`, `shared`, `importer`, `exporter`) stay runtime-agnostic — a standalone app remains buildable (lock-in mitigation; Obsidian is closed-source freeware).
- Vendored plugin versions are pinned and tested as a set.
- Plugin installs always require user consent (community norms; store review would reject silent installs).

---

## Prior decisions

- **The "vault is an implementation detail" principle (`vision.md`) is intentionally reverted for this port.** Maskor already behaves like an Obsidian-style app — files handled on disk, a markdown vault as truth. The port embraces that: it is deliberately a **local app where the user has full ownership of the files**. The vault is the product surface, not an abstraction Maskor owns. (`vision.md` needs a corresponding amendment when this spec graduates from Draft.)
- **Hybrid distribution (CLI scaffolder + vault-doctor plugin), not either alone**: the CLI gives deterministic, offline, version-pinned project creation; the plugin covers repair, upgrades, adopted vaults, and mobile. A single template package feeds both — no config drift between install paths.
- **Keep `@maskor/exporter` instead of relying solely on Longform Compile/Pandoc**: annotation export (references as footnotes, Margin comments as Word comments) exists nowhere else and already works.
- **Adopt community plugins for replaced surface rather than reimplementing**: the client/server bug class (lost work, stale caches, multi-tab clobbering, swap desync) exists only because of the split the port removes; reimplementing replaced surface would reintroduce maintenance without product value.
- **Margins: adopt-first.** Document Comments' anchor format converges on Maskor's ADR 0009 markers; try adoption before porting the Margin column (previously flagged the hardest UI to port). Export integration stays ours either way. A `%%…%%`-based alternative was explored and abandoned 2026-06-23 (`agent/obsidian-comments` branch, recoverable from the branch bundle) — HTML-comment markers won.
- **This direction predates the port investigation.** `references/TODO.md` already recorded the instinct while building subfolders: "do not duplicate obsidian functionality... make this a companion app for obsidian, a layer above, not a replacement." The port is that trajectory taken to its conclusion.
- **Canvas: bespoke `ItemView` is primary; native Canvas is a projection target; patching internals is out** (resolved 2026-07-15, closing the former open question). Rationale: there is still no official Canvas runtime API — everything interactive on native Canvas is monkey-patch territory ([Advanced Canvas](https://github.com/Developer-Mike/obsidian-advanced-canvas) proves it possible and also how fragile it is), and the maskor canvas is semantically not a freeform canvas: ordered lanes, arc overlays, and constraint cues fight native Canvas's grain no matter how it's patched. "Adopt for the generic, build for the semantic": the cheap Sequence↔Canvas projection commands cover freeform spatial work on day one; the bespoke view owns sequence semantics. Custom keys in `.canvas` files are not trusted to round-trip (Obsidian rewrites them), so generated canvases are throwaway projections, never truth.

---

## Open questions

- [ ] 2026-07-15 — SQLite index replacement: MetadataCache + in-memory index persisted to `.maskor/` JSON (the Dataview approach), or sql.js/WASM? DB-only state (`fragment_stats`, suggestion pointer) moves to a data file either way.
- [ ] 2026-07-15 — Margins: is Document Comments mature enough to adopt (v0.1.x)? Verify marker compatibility with existing Margin files; decide fallback (port the Margin column vs. Side Comments).
- [ ] 2026-07-15 — Sequence arrangement surface: adopt Longform's scenes tab (its index file becomes the sequence source of truth?) or keep `.maskor/sequences/` and build the reorder surface into the overview `ItemView`? Interacts with sections, secondary sequences, and import-sequences — Longform has no equivalent for the latter two.
- [ ] 2026-07-15 — StoryLine: re-evaluate when deciding the arrangement surface. Adopt pieces (Manuscript view, boards) despite its competing frontmatter-ordering data model, treat purely as a reference implementation, or ignore? Watch its maturation (store listing, API stability) — at its current pace it may absorb more maskor surface.
- [ ] 2026-07-15 — Canvas view internals: React Flow (xyflow) vs. growing the existing overview components into a pannable surface? And is the undocumented editor-embedding path (Kanban plugin's approach) acceptable for in-place node editing, or is click-to-open the safe default?
- [ ] 2026-07-15 — Canvas view scope creep: the TODO graph-view vision includes composable sidebars, user-defined flows, and annotated graph links. Which of these belong to the canvas `ItemView` v1 and which are indefinite-future?
- [ ] 2026-07-15 — Mobile: in scope or explicitly not? Avoiding Node APIs keeps it open; the vendored-template path works on mobile only via sync.
- [ ] 2026-07-15 — Standalone app: retired at port completion, kept frozen as fallback, or maintained in parallel? (Core-package runtime-agnosticism keeps the door open regardless.)
- [ ] 2026-07-15 — Store listing for `maskor-core`/`maskor-prompting` eventually, or BRAT-only distribution?
- [ ] 2026-07-15 — First de-risking spike (from the original stub): a minimal plugin with one `ItemView` reading fragments + `.maskor/sequences/` from the open vault and rendering the existing arc-graph SVG — validates React-in-Obsidian, style scoping, and the no-DB read path.

---

## Acceptance criteria

- Running the scaffolder yields a vault that opens in Obsidian with the maskor layout, all companion plugins present, enabled, and configured — no manual setup steps.
- The template package is the single source of truth: CLI and vault-doctor produce identical `.obsidian/` state for a fresh vault.
- The arc-graph `ItemView` renders actual arcs from fragment frontmatter + sequence files with no server or database running.
- Opening an existing maskor project vault with `maskor-core` installed offers (does not force) installation of missing companion plugins.
- After first-run seeding, no maskor component overwrites user-modified layout or settings without an explicit "Restore maskor defaults" invocation.
- A sequence exported through the ported `@maskor/exporter` from inside Obsidian is byte-identical to the standalone app's export for the same project state.
- Reordering a fragment in a canvas-view sequence lane persists to the sequence file via the same `@maskor/sequencer` ops as the overview; the arc overlay reflects the new order without a reload.
- "Sequence → Canvas" produces a `.canvas` file Obsidian opens natively; deleting or hand-editing that canvas never mutates the sequence it was projected from.
