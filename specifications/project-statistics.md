# Spec: Project Statistics

**Status**: Stable
**Last updated**: 2026-05-07

**Shipped**:

- 2026-05-08 — User can view a dedicated Stats page per project with global aggregates (fragment counts, readyStatus histogram, total and average word counts) and an alphabetical per-fragment overview table. (plan: references/plans/project-statistics.md)
- 2026-05-08 — Fragment word counts are persisted to the database and recomputed automatically on save or watcher-detected content change. (plan: references/plans/project-statistics.md)
- 2026-05-08 — A read-only fragment stats inspector panel (prompting counters) is available in the editor sidebar, toggled per project from the Advanced section of the General tab. (plan: references/plans/project-statistics.md)
- 2026-05-30 — Stats page per-fragment table has an "Include discarded" toggle (session-local, default off). When on, discarded fragments appear in the table with strikethrough key and muted styling; global aggregates are unaffected.
- 2026-06-04 — `editCount` semantics tightened: the counter increments at most once per suggestion-mode visit (fragment open → navigate away), not once per save. A no-op save never increments. Multiple changed saves within one session count as one. (plan: `scripts/ralph/archive/2026-06-04-small-improvements/`)

---

## Outcome

The user can open a dedicated "Stats" page per project to see global aggregates (fragment counts, average readyStatus, total/average word counts, a readyStatus histogram) and an alphabetical per-fragment overview table (key, word count, last edited, readyStatus). An "Advanced" subsection in the project config exposes a project-scoped toggle that surfaces a read-only `fragment_stats` inspector panel inside the fragment editor sidebar.

---

## Scope

### In scope

- A new top-nav "Stats" page per project, distinct from the existing Overview page
- A global aggregate panel summarising the project
- A per-fragment overview table sorted alphabetically by `key`
- Persisted `wordCount` on `fragment_stats`, recomputed on save and on watcher-detected content change
- A new "Advanced" subsection at the bottom of the project config General tab
- A project-scoped toggle controlling visibility of a `fragment_stats` inspector inside the fragment editor sidebar
- A dedicated stats API surface separate from the standard fragment response

### Out of scope

- The prompting/suggestion engine (see `specifications/prompting.md`)
- Sequence/timeline/arc visualisation (see `specifications/overview.md`)
- Cross-project or org-level stats
- Charting beyond the readyStatus histogram
- Editing or resetting stat values from the UI
- Filtering, multi-column sorting, or search on the per-fragment table
- Global / user-level "advanced" settings (project-scoped only for now)

---

## Philosophy

Statistics are a window into the project, not a target to game. The Stats page exists to help the writer see distribution and progress at a glance — what is mature, what is neglected, how much has been written — without dictating where attention should go. The per-fragment table is intentionally minimal: alphabetical, four columns, no controls.

The inspector panel is a developer/power-user surface for inspecting Maskor's internal `fragment_stats` counters that drive prompting. It is opt-in per project and never modifies anything.

---

## Behavior

### Stats page

- Route: `/projects/:projectId/stats`. Reachable from a top-nav entry labelled "Stats".
- Read-only.
- Two regions:

#### Global panel

- Total fragment count (non-discarded)
- Discarded fragment count
- Ready fragment count (`readyStatus === 1.0`, non-discarded)
- Average `readyStatus` across non-discarded fragments
- `readyStatus` histogram with 5 buckets: `[0, 0.2)`, `[0.2, 0.4)`, `[0.4, 0.6)`, `[0.6, 0.8)`, `[0.8, 1.0]`
- Total word count across non-discarded fragments
- Average word count per non-discarded fragment

#### Per-fragment table

- Columns: `key` (linked to the fragment editor), word count, last edited, `readyStatus` (rendered as a percentage)
- Sort: alphabetical ascending by `key`. Locked in v1.
- Discarded fragments excluded by default. An "Include discarded" toggle above the table (session-local, default off) adds discarded rows to the table. Discarded rows render with strikethrough key and muted opacity; the key is not linked (navigating to a discarded fragment is unsupported from the Stats page).
- Empty state when the project has no fragments.

### Word count persistence

- `fragment_stats` gains a `wordCount` column.
- It is recomputed and persisted whenever fragment content changes:
  - On API save of fragment content.
  - On watcher-detected file content change (insert or update).
- It is content-derived, not user-input. If the row is wiped, the next save or watcher pass restores it. Acceptable.
- Tokenisation rules are deferred to the implementation plan; the intent is "what a writer would call a word", not a precise lexer.

### Advanced settings (project config)

- A new subsection labelled **"Advanced"** appears at the bottom of the General tab in the project config page.
- First entry: a toggle "Show fragment stats panel in editor" (default off).
- The toggle is persisted on the project record and is project-scoped — each project has its own value.
- The "Advanced" subsection is designed to grow; future power-user toggles land here.

### Stats inspector panel (fragment editor sidebar)

- When the project's "Show fragment stats panel" toggle is on, the fragment editor's metadata sidebar gains a collapsible **Stats** section.
- It displays the raw values of the current fragment's `fragment_stats` row:
  - `wordCount`
  - `editCount`
  - `voluntaryOpenCount`
  - `promptAcceptCount`
  - `avoidanceCount`
  - `lastSurfacedAt`
- Read-only. No reset, no edit.
- Data is fetched via a dedicated stats endpoint, not via the standard fragment response.
- Refreshes on fragment open and after a successful save. No polling.
- Hidden entirely when the toggle is off — the section does not render.

---

## Constraints

- `fragment_stats` remains Maskor-internal in the file/vault sense: not written to vault files, not subject to watcher sync of stats, not added to the standard fragment API response. The new stats endpoints are additional surfaces; they do not relax the file-side rule.
- The Stats page is read-only. It never mutates fragment, project, or stats data.
- `last edited` is sourced from `fragments.updatedAt` (DB), not from filesystem mtime.
- The per-fragment table sort is locked to alphabetical by `key` in v1; no user-toggleable sort.
- Advanced settings are project-scoped; there is no global / per-user store for them in this iteration.
- The advanced toggle controls visibility of the inspector panel only. It does not affect what the API returns or what is computed; `fragment_stats` is always tracked.
- Word count is stored alongside the other per-fragment counters in `fragment_stats` rather than on `fragments` to keep the per-fragment side data in one table.

---

## Prior decisions

- **Separate "Stats" page, not a tab inside Fragments or Overview**: The existing "Overview" page is reserved for sequence/arc visualisation and shouldn't grow stats responsibilities. A peer page keeps both surfaces focused.
- **Project-scoped advanced settings**: Power-user toggles live on the project record for now. A user-level / global store can be revisited if a setting genuinely needs to apply across projects.
- **No per-fragment-editor toggle**: Inspector visibility is owned by project config. Splitting the on/off flag across two homes was rejected.
- **Word count stored in `fragment_stats`**: Although content-derived rather than behavioral, word count is consumed by the same surfaces as the other counters and grows in lockstep with edits. Avoids adding a side table for a single column.
- **`updatedAt` over filesystem mtime**: The DB timestamp is the consistent source of truth across UI surfaces; mtime is brittle across vault sync, exports, and external tools.
- **Sort by `key` only in v1**: The fragment list already uses key-based sort. A sort/filter UI on the stats table can wait for actual user need.
- **Dedicated stats endpoint**: Keeps `fragment_stats` out of the standard fragment payload and gives the Stats page a single batch read it can cache independently.
- **Discarded fragment toggle is session-local**: The preference to see discarded rows is transient — not persisted to project.json. It is a debugging/review affordance, not part of the normal writing workflow.
- **API returns all fragments, frontend filters**: The stats endpoint now includes discarded fragments with `isDiscarded: true`. The frontend hides them by default. Global aggregate fields remain non-discarded only.

---

## Open questions

- [ ] 2026-05-07 — Word count tokenisation rules. Initial proposal: strip code fences and link URLs (`[text](url)` → `text`), then count whitespace-separated tokens. Markdown-aware lexing is overkill in v1.
- [ ] 2026-05-07 — `fragment_stats` row creation timing once `wordCount` lands. Eager on fragment insert (every fragment has a row immediately) vs. lazy on first stat write. Eager simplifies the Stats query; lazy keeps the existing policy.
- [x] 2026-05-07 — Should the per-fragment table optionally include discarded fragments behind a toggle? **Resolved 2026-05-30**: Yes. A session-local "Include discarded" checkbox above the table shows discarded rows with strikethrough styling. Global aggregates remain non-discarded only.
- [ ] 2026-05-07 — Final label for the advanced toggle. Initial proposal: "Show fragment stats panel in editor".
- [ ] 2026-05-07 — Inspector panel placement within the editor sidebar (top, bottom, beneath aspects, etc.). Visual call, deferred to implementation.

---

## Acceptance criteria

- The project shell shows a "Stats" entry in the top navigation.
- The Stats page renders the global panel and the per-fragment table for any project with at least one fragment.
- The global panel values match counts and averages computed from the fragments and `fragment_stats` tables.
- The 5-bucket `readyStatus` histogram totals match the non-discarded fragment count.
- Per-fragment rows are sorted alphabetical ascending by `key`.
- Saving a fragment with content change updates its `wordCount` in `fragment_stats`.
- A watcher-detected content change updates `wordCount` in `fragment_stats` for the affected fragment.
- Toggling "Show fragment stats panel in editor" off causes the editor sidebar to render without the Stats section; toggling on causes it to appear.
- The standard fragment API response contains no `fragment_stats` fields regardless of toggle state.
- The inspector panel displays the current `fragment_stats` values for the open fragment when the toggle is on, and refreshes after a successful save.
- The Stats page renders an empty state when the project has no fragments.
