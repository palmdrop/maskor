# Spec: Quick-switcher

**Status**: Draft
**Last updated**: 2026-05-25
**Shipped**:

---

## Outcome

The user can press a single key-bind from anywhere in the active project and jump to any existing entity — fragment, aspect, note, reference, or sequence — by typing its key. The quick-switcher is the canonical surface for entity selection; the command palette is the canonical surface for actions. The two surfaces share the underlying `Picker` primitive but stay independently triggered.

---

## Scope

### In scope

- A modal entity quick-switcher opened by a global keyboard shortcut, available on every route once a project is active.
- A unified, project-scoped catalog of all selectable entities: fragments, aspects, notes, references, sequences.
- Fuzzy search against entity keys, using the same cmdk subsequence scoring used by the command palette.
- A row format with a type chip, the entity's key, and (for fragments) a discarded-status filter applied.
- Open semantics defined per entity type, with a single principle: the current view stays mounted iff it natively renders the picked entity type; otherwise the switcher navigates to the entity's canonical route.
- Suggestion-mode integration: picking a fragment from inside suggestion mode swaps it in place without leaving the mode, and obeys a defined set of stat-accounting rules (see `prompting.md`).
- Removal of the `Switch sequence…` palette command in favor of a generic `Switch to…` palette command that opens this surface.

### Out of scope

- **Projects.** Cross-project switching stays in the command palette as `Switch project…`. A Maskor session is single-project; the quick-switcher is project-scoped.
- **Full-text search.** Match is against `key` only. Body content, frontmatter values, and aspect weights are not part of the match string. Full-text search is a future, separate feature.
- **Recency boost.** Both empty-query and typed-query results are deterministic in v1. Recency is a future enhancement (see Open questions).
- **Pinning.** Deferred — not enough use case yet.
- **Type-prefix filtering** (`f:river`, `a:melancholy`). Deferred; the unified ranked list is the v1 experience.
- **Modifier-based open variants** (`Cmd+Enter` for new tab, etc.). Depends on the future [[tabs / multiple open editors]] spec.
- **Sections, drafts, arcs, pieces.** Not selectable through this surface — they are not navigable entities in their own right (sections live inside sequences, drafts are snapshots, arcs are owned by aspects, pieces are transient).
- **Discarded fragments.** Excluded from the candidate set — honoring the user's "out of mind" signal. Resurrection paths exist elsewhere (fragment list "show discarded" toggle).

---

## Behavior

### Trigger and focus

- `Cmd/Ctrl+O` opens the quick-switcher from any focus — including the Tiptap prose editor and CodeMirror raw/vim editor.
- The switcher is a focus-trapped modal. On close, focus returns to the previously focused element so a writer can resume typing mid-sentence.
- `Esc` closes the switcher.
- Editor extensions (Tiptap, CodeMirror) MUST NOT capture `Cmd/Ctrl+O`. The global binding takes precedence. Already reserved alongside the command-palette bindings in `command-palette.md`.
- The switcher is only available when a project is active. On the project management screen (`/`), the binding is inert.

### Entity catalog

The catalog is composed at open time from the active project's vault contents.

| Entity        | Inclusion rule                                                                  | Source   |
| ------------- | ------------------------------------------------------------------------------- | -------- |
| **Fragment**  | All non-discarded fragments. Fragments with `readyStatus === 1.0` are included. | Vault DB |
| **Aspect**    | All aspects in the project.                                                     | Vault DB |
| **Note**      | All notes in the project.                                                       | Vault DB |
| **Reference** | All references in the project.                                                  | Vault DB |
| **Sequence**  | All sequences in the project (main and secondary).                              | Vault DB |

Excluded by design: projects, sections, drafts, arcs, pieces. See Scope.

### Match field

The match string is the entity's `key` (per the glossary: the filename stem, also the display title). Body content, frontmatter, and any derived data are not part of the search index.

The same `key` may exist across entity types (e.g. a fragment and a note both called `river`). Both rows appear; the type chip disambiguates.

### List structure

- **Empty query** — grouped by entity type, alphabetical within each group. Sections in the order: Fragments, Aspects, Notes, References, Sequences. A group with zero entities is omitted entirely.
- **Typed query** — flat ranked list using cmdk's built-in subsequence scoring. Type chips remain on each row for disambiguation. No grouping, no per-type ordering.
- **No matches** — a single "No matches" line, same pattern as the command palette.

### Row format

Single-line rows: type chip (left, always shown), key (center), nothing on the right. No hotkey column — the switcher is not a hotkey-binding surface.

### Open semantics

When the user picks a row, the switcher closes and resolves to either an in-place swap or a navigation. The rule:

> The current view stays mounted iff it natively renders the picked entity type as its primary content. Otherwise the switcher navigates to the entity's canonical route.

Concretely:

| Current view                                                     | Pick fragment                                                               | Pick aspect               | Pick note / reference         | Pick sequence                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------- | ----------------------------- | ------------------------------------------ |
| Fragment editor                                                  | route swap (`/fragments/:uuid`)                                             | navigate to aspect editor | navigate to attachment editor | navigate to Overview, swap active sequence |
| Suggestion mode                                                  | swap in place (set active suggestion-mode fragment; no new prompt surfaced) | navigate to aspect editor | navigate to attachment editor | navigate to Overview, swap active sequence |
| Aspect editor                                                    | navigate to fragment editor                                                 | route swap                | navigate                      | navigate to Overview, swap active sequence |
| Overview                                                         | navigate to fragment editor                                                 | navigate to aspect editor | navigate                      | swap active sequence in place              |
| Fragment list, project config, suggestion-mode empty state, etc. | navigate                                                                    | navigate                  | navigate                      | navigate to Overview, swap active sequence |

"Navigate" goes through the same routing layer used by `<Link>` elements and command-system navigation commands; the existing unsaved-changes prompt (per `navigation.md`) fires before any cross-route move.

A sequence pick is always paired with a navigation to Overview, regardless of current view — the user's intent ("switch _to_ this sequence") implies viewing it.

### Suggestion-mode integration

When the user picks a fragment via the quick-switcher while suggestion mode is the current view, the following rules apply (cross-referenced in `prompting.md`):

- **Eligibility bypass.** The picked fragment loads even if it would not have been chosen by the prompting engine — including fragments with `readyStatus === 1.0`. The user's explicit pick overrides the eligibility filter for this load only; subsequent `Next` presses go back to the engine and its filters.
- **`voluntary_open_count++`.** The pick increments the fragment's voluntary-open stat. The stat's definition was broadened from "outside suggestion mode" to "any user-initiated action regardless of mode" to cover this case.
- **No avoidance accounting.** If the user picks a fragment and then presses `Next` without saving, `avoidance_count` is NOT incremented. Avoidance is reserved for engine-surfaced picks the user rejects.
- **Cooldown applies on `Next`.** The picked fragment enters cooldown on `Next` just like any engine-surfaced fragment — cooldown does not care how the fragment got loaded.

### Palette composition

- The standalone `Switch sequence…` palette command is removed; the quick-switcher is now the canonical way to switch sequences.
- A new generic `Switch to…` palette command is added (no `arg`). Its `run` opens the quick-switcher. This gives palette-driven users a discoverable entry point to the feature.
- The `Switch project…` palette command is unchanged — projects are not in the quick-switcher.
- Both palette additions/removals land with the implementation; `command-palette.md` is updated in the same slice.

### Empty states

- **No matches** — a single "No matches" line, same pattern as the command palette.
- **Empty project** — if the active project has zero entities of any type, the empty state reads `"This project is empty. Create a fragment, aspect, note, or reference to get started."` (no entries to render).

### Loading and failure

- Entity lists are loaded via the generated React Query hooks. The switcher opens against whatever is currently in the React Query cache.
- On cold cache, the switcher renders skeleton rows per group until the queries resolve.
- On a query failure, the switcher closes and a toast surfaces the error. (Same pattern as parameterized command-argument loading failure in `command-palette.md`.)

---

## Constraints

- Built on the shared `Picker` primitive (`packages/frontend/src/components/picker/Picker.tsx`). No new picker abstraction.
- cmdk powers the scoring and a11y wiring, same as the command palette. No new search dependency.
- The switcher is mounted at the project shell level (alongside view-scoped command registration), so it is bound iff a project is active.
- Editor extensions must yield `Cmd/Ctrl+O` (Tiptap via configuration, CodeMirror via `Prec.highest` keymap or top-level listener) — same constraint already in `command-palette.md`.
- All entity loads use the orval-generated client; no hand-rolled `useQuery` against `customFetch` (per `packages/frontend/CLAUDE.md`).
- Architecture must allow future recency, pinning, and type-prefix scoping to be added without rewriting the surface — i.e. entity rows carry their type in the model from the start, and the empty-state ordering function is replaceable.

---

## Prior decisions

- **Unified entity surface, not per-type.** See [ADR-0001](../references/adr/0001-unified-quick-switcher-surface.md). Writers think of entities as peers; per-type entry points can be added later as a filter, much harder to consolidate after splitting.
- **Project-scoped.** A Maskor session is single-project; cross-project switching stays in the palette as `Switch project…`. Rationale: keeps the switcher's catalog bounded and avoids "what happens when I switch to a project mid-edit" semantics inside the entity flow.
- **Same-view-swap-in-place principle.** When the current view natively renders the picked entity type, the view stays mounted and swaps content; otherwise the switcher navigates. Rationale: matches the user's mental model (Fragment editor + pick fragment ≈ "show me this one instead"), keeps suggestion mode coherent (picking a fragment doesn't kick the user out of the mode), and generalizes cleanly across entity editors.
- **Sequence picks always land on Overview.** Rationale: "switch to sequence X" implies wanting to see X. Going to the project config or staying on an unrelated view would be confusing. The palette's removed `Switch sequence…` command had the same end-state behavior in practice; this just makes it explicit.
- **Quick-switcher pick bypasses suggestion-mode eligibility.** An explicit user pick is intent that overrides the engine's filters. Silent failure (or auto-skip) when the user picks a `readyStatus === 1.0` fragment would be confusing. Eligibility filters only what the _engine_ surfaces.
- **`voluntary_open_count` broadened to "any user-initiated open".** Quick-switcher picks made inside suggestion mode now count toward the stat (the pick is still the user actively seeking out the fragment). Spec edit applied inline to `prompting.md`.
- **Avoidance is engine-pick-only.** A user-picked fragment skipped via `Next` is navigation, not avoidance. Counting both would double-penalize fragments the user sought out and then deferred.
- **Cooldown is mode-agnostic.** Once a fragment was just on screen, the prompting engine should not immediately re-surface it — regardless of how it got there.
- **Discarded fragments excluded.** Honors the user's "I don't want to see this again" signal. Resurrection paths exist in the fragment list.
- **Match against `key` only.** Body content, frontmatter, and weights are not part of the match string. Full-text search is a future, separate feature; conflating the two would either bloat ranking or surprise users with body matches they did not ask for.
- **Key collisions across types are fine.** The type chip disambiguates; the catalog is small enough that no extra sort key is needed.
- **Empty query → grouped alphabetical; typed query → flat ranked.** Empty shows structure (browsable); typed collapses to a single ranked list (intent-driven). cmdk scoring is the v1 ranking.
- **Recency, pinning, type-prefix filters, and modifier-based open variants are deferred.** None block v1; architecture leaves room for each. Tracked in Open questions.
- **Generic `Switch to…` palette command replaces `Switch sequence…`.** Keeps palette discoverability without duplicating the parameterized-pick implementation. The standalone sequence command is removed.

---

## Open questions

- [ ] 2026-05-25 — Recency on empty query: persistence model (in-memory FIFO, vault DB, or localStorage), bounded size (~20?), invalidation on entity rename/delete. Tracked as a future enhancement; v1 ships deterministic.
- [ ] 2026-05-25 — Pinning: storage location (per-project? per-user?), surface for pin/unpin (palette command? right-click? hover affordance?), visual treatment.
- [ ] 2026-05-25 — Type-prefix filter syntax (`f:`, `a:`, `n:`, `r:`, `s:`?) and whether it composes with cmdk's scoring or replaces it.
- [ ] 2026-05-25 — Modifier-based open variants (`Cmd+Enter` → new tab) — blocked on the tabs spec; revisit when [[tabs / multiple open editors]] graduates from `_drafts.md`.
- [ ] 2026-05-25 — Visual styling of type chips (color per type? glyph? plain text label?). Broad-strokes UI decision, deferred to implementation.
- [ ] 2026-05-25 — Whether the empty-state copy doubles as a "create new entity" affordance (typing a key not in the project → offer to create it). Tempting but expands scope into create flows; deferred.

---

## Acceptance criteria

- Pressing `Cmd/Ctrl+O` opens the quick-switcher from any focus while a project is active, including inside the Tiptap prose editor and the CodeMirror raw editor.
- The binding is inert on the project management screen (`/`).
- `Esc` closes the switcher and restores focus to the previously focused element.
- With no typed query, the switcher shows a grouped alphabetical list of all selectable entities (Fragments, Aspects, Notes, References, Sequences), with empty groups omitted.
- With a typed query, the switcher shows a flat ranked list using cmdk's subsequence scoring; "No matches" appears when nothing matches.
- Each row shows a type chip on the left and the entity's key as the label.
- Discarded fragments do not appear in the catalog.
- Fragments with `readyStatus === 1.0` appear in the catalog and are selectable.
- An entity key shared between two entity types (e.g. fragment `river` and note `river`) shows two rows, distinguished by their type chips.
- Selecting a fragment while the current view is the Fragment editor swaps the route to `/fragments/:uuid` for the picked fragment.
- Selecting a fragment while the current view is suggestion mode swaps the active suggestion-mode fragment in place without leaving the mode, and does not surface a new prompt.
- Selecting a fragment from any other view navigates to `/fragments/:uuid` for the picked fragment.
- Selecting a fragment in suggestion mode loads it even if its `readyStatus === 1.0` (eligibility bypass).
- Selecting a fragment in suggestion mode increments that fragment's `voluntary_open_count`.
- Pressing `Next` after a quick-switcher pick in suggestion mode does NOT increment the picked fragment's `avoidance_count`.
- Pressing `Next` after a quick-switcher pick in suggestion mode applies the same cooldown to the picked fragment as any engine-surfaced fragment would receive.
- Selecting an aspect while the current view is the aspect editor swaps the route to the picked aspect; from any other view, navigates to the aspect editor for the picked aspect.
- Selecting a note or reference navigates to its editor route.
- Selecting a sequence switches the active sequence and navigates to Overview, regardless of the current view; if already on Overview, the sequence is swapped in place.
- Navigation triggered by a quick-switcher selection respects the existing unsaved-changes prompt from `navigation.md`.
- The standalone `Switch sequence…` palette command is removed; a generic `Switch to…` palette command opens the quick-switcher.
- The `Switch project…` palette command continues to function unchanged.
- Editor extensions (Tiptap, CodeMirror) do not consume `Cmd/Ctrl+O`.
- The same `Picker` primitive that powers the command palette renders the quick-switcher.
