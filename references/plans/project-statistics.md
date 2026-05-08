# Project statistics — Stats page and fragment-stats inspector

**Date**: 08-05-2026
**Status**: Done
**Specs**: `specifications/project-statistics.md`

---

## Goal

A new top-nav "Stats" page (`/projects/:projectId/stats`) renders global aggregates and an alphabetical per-fragment overview table; saving a fragment or watcher-detecting a content change persists `wordCount` into `fragment_stats`; an "Advanced" subsection at the bottom of the project config General tab toggles a read-only `fragment_stats` inspector panel inside the fragment editor sidebar (project-scoped).

---

## Tasks

### Phase 1 — Schema and word-count persistence

- [x] Add `wordCount` column (`integer`, `notNull`, `default 0`) to `fragmentStatsTable` in `packages/storage/src/db/vault/schema.ts`.
- [x] Generate a Drizzle migration for the new column.
- [x] Add a pure `computeWordCount(content: string): number` helper in `packages/storage`. Initial tokenisation: strip fenced and inline code, replace `[text](url)` with `text`, then count whitespace-separated tokens. Keep simple; tune later if needed.
- [x] Extend `stats-repo.ts` with `setWordCount(uuid, value)` (upsert) and `getStatsForProject(projectId)` (batch read for the Stats page).
- [x] Wire `wordCount` upsert at both update sites:
  - The fragment save handler (API `PATCH /fragments/:id`) when content changed.
  - The watcher pipeline that handles inserts and content changes.
- [x] Decide and document row-creation timing for `fragment_stats` once `wordCount` lands (eager on fragment insert vs. lazy on first stat write). Note the choice in `stats-repo.ts`.

### Phase 2 — Project config: Advanced subsection

- [x] Extend the `Project` schema in `packages/shared/src/schemas/domain/project.ts` with an advanced-settings group, e.g. `advanced: { showFragmentStats: boolean }`. Default `false`. Mirror in `ProjectUpdateSchema` as optional partial.
- [x] Mirror the new field in the Drizzle project record / project storage (whichever package owns project persistence).
- [x] Surface the new field through the project read/update API; regenerate the orval client.
- [x] In `packages/frontend/src/pages/ProjectConfigPage/tabs/GeneralTab.tsx`, append an **Advanced** section after Suggestion. First entry: a Switch labelled "Show fragment stats panel in editor", wired through the existing `useUpdateProject` flow.

### Phase 3 — Fragment-stats inspector in the editor sidebar

- [x] New API endpoint `GET /projects/:projectId/fragments/:fragmentId/stats` in `packages/api/src/routes/fragments.ts` (or a new route file). Returns the raw `fragment_stats` row; returns zeros when no row exists. OpenAPI schema added.
- [x] Regenerate orval client; expose `useGetFragmentStats`.
- [x] In the fragment editor's metadata sidebar component, add a collapsible "Stats" section:
  - Renders only when the project's `advanced.showFragmentStats` flag is on.
  - Fetches `/stats` for the current fragment.
  - Lists `wordCount`, `editCount`, `voluntaryOpenCount`, `promptAcceptCount`, `avoidanceCount`, `lastSurfacedAt`.
  - Refreshes on fragment open and after a successful save (no polling).
- [x] Verify the standard fragment API response is unchanged — no stats fields leaked in.

### Phase 4 — Stats page

- [x] New API endpoint `GET /projects/:projectId/stats` returning:
  - `global`: `totalCount`, `discardedCount`, `readyCount`, `averageReadyStatus`, `readyStatusHistogram` (5 buckets), `totalWordCount`, `averageWordCount`.
  - `fragments`: array of `{ uuid, key, wordCount, updatedAt, readyStatus, isDiscarded }` sorted ascending by `key`. Discarded fragments excluded from this array in v1.
- [x] OpenAPI schema added; orval client regenerated.
- [x] Add `projectStatsRoute` (`/projects/$projectId/stats`) in `packages/frontend/src/router.ts`.
- [x] New page `packages/frontend/src/pages/ProjectStatsPage/index.tsx`:
  - Global panel: stat tiles for each scalar; `readyStatus` histogram as a 5-bar inline chart (CSS-only if practical, otherwise a small lib already used in the repo).
  - Per-fragment table: columns Key (linked to FragmentPage) / Words / Last edited / Ready (%).
  - Empty state when there are no fragments.
- [x] Add a "Stats" entry to the top nav in `ProjectShellLayout.tsx`.

### Phase 5 — Tests

- [x] Unit: `computeWordCount` over plain prose, fenced code, inline code, and links — confirm tokens match expectation.
- [x] Storage: `setWordCount` upserts; `getStatsForProject` returns the right shape and ordering.
- [x] API: project stats endpoint aggregates correctly (counts, averages, histogram); fragment stats endpoint returns zeros for fragments with no row; word-count update path runs through both PATCH and the watcher.
- [x] Frontend: Stats page renders against a mocked API response; toggling "Show fragment stats panel in editor" shows/hides the inspector; inspector refreshes after save.

### Phase 6 — Spec hygiene and snapshot

- [x] Confirm the small constraint added to `specifications/prompting.md` still reads correctly after implementation. Adjust wording if anything diverges.
- [x] Run `bun run snapshot` after the change settles.

---

## Open questions surfaced for review (not blocking the plan)

- [x] Final label for the advanced toggle ("Show fragment stats panel in editor" proposed).
  - DEVELOPER ANSWER: Accepted.
- [x] Eager vs. lazy `fragment_stats` row creation once `wordCount` is added.
  - DEVELOPER ANSWER: Eager.
- [x] Whether the per-fragment table later gains an "include discarded" toggle.
  - DEVELOPER ANSWER: Sure, but can be deferred for now. I have added an item to the todo.md file.
- [x] Inspector panel placement within the metadata sidebar (top, bottom, between sections).
  - DEVELOPER ANSWER: Bottom of the metadata sidebar.

---

## Constraints carried from the spec

- `fragment_stats` stays Maskor-internal: not in vault files, not in the standard fragment API response, not subject to watcher sync.
- Inspector and Stats page consume stats only through dedicated endpoints.
- Last-edited values come from `fragments.updatedAt`, not filesystem mtime.
- Per-fragment table sort is locked to alphabetical ascending by `key` in v1.
- Advanced settings are project-scoped only.
- The Stats page is read-only.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.
