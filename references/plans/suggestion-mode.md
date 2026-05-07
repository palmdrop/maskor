# Suggestion mode — prompted fragment editing

**Date**: 07-05-2026
**Status**: Done
**Specs**: `specifications/prompting.md`

---

## Terminology

The developer-facing name for this feature is **suggestion mode** (sometimes shortened to `suggestion` in code paths, types, route names, etc.). This is the term used throughout the codebase, this plan, and any internal docs going forward.

The **user-facing label** is undecided. The nav-tab label is `Edit` for now; the page title and any in-product copy are open. Final user-facing naming should not block any of this implementation — every code identifier uses `suggestion` / `suggestionMode`.

---

## Goal

A dedicated, top-nav-accessible page (`Edit` in the nav for now) where the user works through a single suggested fragment at a time, chosen by the prompting engine from a weighted, non-deterministic selection over the user's eligible pool. Reuses `FragmentEditor` with the metadata sidebar made retractable; "Next" auto-saves the current fragment (if dirty) and loads another suggestion. Stats that drive selection are persisted server-side in a `fragment_stats` table and updated at action sites. Selection is a pure, testable function over `(eligibleFragments, stats, rng, weights)`.

---

## Architectural shape

```
/projects/:projectId/suggestion                     ← new route, top-nav entry "Edit"
  └── SuggestionModePage
        ├── selection: useNextSuggestion()          ← server query, advances on Next
        ├── FragmentEditor (re-used)
        │     └── EntityEditorShell (modified: sidebar retractable)
        │           ├── ProseEditor
        │           └── sidebar = FragmentMetadataForm (re-used)
        ├── controls: Next (Cmd/Ctrl+Enter), Exit (Esc)
        └── nudge banner (when avoidance_count ≥ threshold for current fragment)

packages/storage/src/db/vault/schema.ts
  + fragmentStatsTable                              ← new

packages/storage/src/suggestion/                    ← new module (final home tbd; see open question)
  ├── selector.ts        pure (eligibleFragments, stats, rng, weights) → uuid | null
  ├── weights.ts         weight constants + composition formula
  ├── cooldown.ts        in-memory time-windowed set with oldest-first fallback
  └── stats-repo.ts      readers + incrementers

packages/api/src/routes/suggestion.ts               ← new
  GET  /projects/:projectId/suggestion/next?exclude=<uuid>
  POST /projects/:projectId/suggestion/visit/:fragmentId
        (records voluntary open from outside suggestion mode)

Stat updates wired at action sites (synchronous, in same handler that performs the action):
  - Fragment opened from list/overview      → voluntary_open_count++
  - Fragment loaded via suggestion/next     → prompt_accept_count++; track "edited?" flag in cooldown entry
  - Fragment update saved with content/meta → edit_count++; clear "needs-edit" flag for cooldown entry
  - Next pressed without an edit            → avoidance_count++ for the leaving fragment
```

---

## Tasks

### Phase 1 — Stats schema and repository

- [ ] Add `fragmentStatsTable` to `packages/storage/src/db/vault/schema.ts`. Columns: `fragmentUuid` (PK, FK to `fragments.uuid` ON DELETE CASCADE), `voluntaryOpenCount` (int, default 0), `promptAcceptCount` (int, default 0), `avoidanceCount` (int, default 0), `editCount` (int, default 0), `lastSurfacedAt` (timestamp, nullable). Index `lastSurfacedAt`.
- [ ] Generate migration via `drizzle-kit`.
- [ ] Add `stats-repo.ts` with: `getStats(uuid)`, `getStatsBatch(uuids[])`, `incrementVoluntaryOpen(uuid)`, `incrementPromptAccept(uuid)`, `incrementEdit(uuid)`, `incrementAvoidance(uuid)`, `markSurfaced(uuid, timestamp)`. All upsert-style — first interaction creates the row.
- [ ] Decide row creation timing: lazy on first stat increment (preferred) vs. eager on fragment insert (more code, no win). Document choice in code.

### Phase 2 — Selector module (pure, no I/O)

- [ ] Create `packages/storage/src/suggestion/` (or alternative — confirm package home before starting; see open question).
- [ ] `weights.ts` — single config object with all weight constants (`readyStatusWeight`, `voluntaryOpenPenalty`, `avoidancePenalty`, `editCountWeight`). Document the composition formula in a single comment block. `edit_volume` is dropped per discussion.
- [ ] `selector.ts` — pure function `selectNextSuggestion({ eligibleFragments, stats, cooldownSet, rng, weights }) → uuid | null`. RNG injected for testability (seed-able).
- [ ] `cooldown.ts` — in-memory `Map<uuid, surfacedAt>` per project. API: `add(uuid)`, `purgeExpired(now, windowMs)`, `getEligible(allFragmentUuids)`. Fallback: when `getEligible` would return empty, return the N oldest cooldown entries sorted ascending by `surfacedAt` with small random jitter on the result.
- [ ] Eligibility filter is separate: `isDiscarded === false && readyStatus < 1.0`. This runs before cooldown.
- [ ] Decide cooldown window default. Initial: 30 minutes (open for tuning).

### Phase 3 — API endpoints

- [ ] `GET /projects/:projectId/suggestion/next` — optional `?exclude=<uuid>` to exclude the currently displayed fragment from selection (used when pressing Next without leaving the page).
  - Response: `{ fragment: Fragment } | { fragment: null }` (null when pool is empty).
  - Side effects: marks the returned fragment as surfaced (cooldown), increments `prompt_accept_count`, sets `last_surfaced_at`.
- [ ] `POST /projects/:projectId/suggestion/visit/:fragmentId` — called by the frontend when a fragment is opened **outside** suggestion mode (from list, overview tile, etc.). Increments `voluntary_open_count`. Returns `204`.
- [ ] Wire `edit_count` increment into the existing `PATCH /fragments/:id` handler when the patch contains a content or metadata change.
- [ ] Wire `avoidance_count` increment into the suggestion flow: when `GET /suggestion/next?exclude=<uuid>` is called and the excluded fragment was surfaced via suggestion mode and never received an edit save while displayed, increment its `avoidance_count`. Track this state server-side via the cooldown entry, not the client. (See open question for the alternative.)
- [ ] Add OpenAPI schemas; regenerate the orval client.

### Phase 4 — Make sidebar retractable in `EntityEditorShell`

- [ ] Add a `sidebarCollapsible?: boolean` prop (default `false` to keep current behavior).
- [ ] When `true`: render a chevron toggle, persist collapsed state per-entity-type (or per-project) in localStorage, animate width transition. Sidebar slides out, prose area expands.
- [ ] No regressions in existing FragmentEditor / NoteEditor / ReferenceEditor / AspectEditor pages — `sidebarCollapsible` defaults off.

### Phase 5 — Suggestion-mode page

- [ ] New route `/projects/$projectId/suggestion` in `packages/frontend/src/router.ts` (route name: `suggestionModeRoute`).
- [ ] Add nav link "Edit" to `ProjectShellLayout.tsx`.
- [ ] New page `packages/frontend/src/pages/SuggestionModePage/index.tsx`.
- [ ] On mount: query `GET /suggestion/next` to load the first fragment. Render `<FragmentEditor key={fragmentId} sidebarCollapsible projectId={...} fragmentId={...} />`.
- [ ] **Empty state**: if the endpoint returns `{ fragment: null }`, render a "no fragments need work" view with a link back to the fragment list.
- [ ] **Controls**:
  - Next (button + `Cmd/Ctrl+Enter`): if dirty, auto-save first (call the editor's save); then call `GET /suggestion/next?exclude=<currentUuid>`. If save fails, surface error inline and do not advance.
  - Exit (button + `Esc`): navigate back to the fragment list. If dirty, follow the editor's existing unsaved-changes guard.
  - No "close" control distinct from Next; Next is the only forward action.
- [ ] **`readyStatus` nudge banner**: if the loaded fragment's `avoidance_count >= avoidanceNudgeThreshold` (default 3), render a dismissable banner above the editor: "You've skipped this fragment a few times. Mark it ready, raise its readyStatus, or discard it." Banner must not auto-modify `readyStatus`.

### Phase 6 — Voluntary open tracking

- [ ] Wire `POST /suggestion/visit/:fragmentId` into the existing fragment open path (`FragmentPage` mount, or wherever a fragment is opened from list / overview / link). Fire-and-forget; do not block render.
- [ ] Do **not** call this endpoint when a fragment is loaded inside suggestion mode — that path increments `prompt_accept_count` server-side instead.

### Phase 7 — Tests

- [ ] **Selector unit tests**: seed-able RNG, fixed weights, fixed stats fixtures. Cases: lower readyStatus surfaces more often; high voluntary-open fragments surfaced less; avoidance penalty caps but does not exclude; empty pool returns null; all-in-cooldown falls back to oldest-with-jitter.
- [ ] **Cooldown tests**: time window expiry; fallback when all in cooldown; insertion order preserved.
- [ ] **API tests** (`packages/api/src/__tests__/routes/suggestion.test.ts`): `next` excludes finished and discarded fragments; `next` excludes currently-cooled fragments; `visit` increments `voluntary_open_count`; `next?exclude=uuid` increments `avoidance_count` only when the excluded fragment was surfaced via suggestion mode and not edited.
- [ ] **Stats persistence**: increments survive restart; absent rows treated as zero.
- [ ] **Frontend integration**: suggestion mode renders an editor when pool non-empty; renders empty state when pool empty; Next saves then advances; Esc exits; nudge banner appears for high-avoidance fragments.

### Phase 8 — Open questions surfaced for review (do not implement until resolved)

- [ ] Cooldown window default — propose 30 min; confirm.
- [ ] Avoidance nudge threshold — propose 3; confirm.
- [ ] Weight values — start with placeholder constants; expect tuning after first usage. Do not expose to users.
- [ ] Avoidance accounting site — server-tracked (preferred, in the cooldown entry) vs. client-driven (`?previousWasEdited=bool` on Next). Server-tracked keeps the source of truth on the backend but means cooldown entries carry more state.
- [ ] Package home for the suggestion module — `packages/storage/src/suggestion` (close to the DB) or `packages/sequencer` (closer to the algorithmic-selection cousin) or new `packages/suggestion` package. Affects import boundaries.
- [ ] Auto-save reliability on Next — see suggestion in `references/SUGGESTIONS.md` about a temporary unsaved-edit cache. For this plan, auto-save is best-effort: if it fails, Next is blocked and the error surfaces inline; the user must save manually or fix the issue.
- [ ] Final user-facing label (nav tab is `Edit`; the page itself is unlabelled for now — confirm).
- [ ] Should a fragment that was just edited and saved be excluded from Next's selection on that same session, even after the cooldown window? Currently, no — cooldown handles it. Confirm.

---

## Constraints carried from the spec

- `fragment_stats` is Maskor-internal: not in vault files, not in the fragment API response, not subject to watcher sync.
- Stats persist across restarts. Wiped DB → stats reset to zero. Acceptable.
- Suggestion mode has no effect on sequence position or fitting scores.
- Selection is non-deterministic but seed-able in tests.
- The `readyStatus` nudge is informational only; never auto-modifies `readyStatus`.

---

## Spec divergences (already reflected in `specifications/prompting.md`)

- Trigger model: dedicated mode/page replaces the post-save card.
- Action model: edit-and-stay or Next; Accept implicit; Dismiss replaced by Exit.
- Avoidance: Next-without-edit (any duration; no time threshold).
- Cooldown: time-window only with oldest-first fallback (replaces the "N fragments OR time, whichever first" punt).
- Drop `edit_volume`; keep `edit_count`.
- No per-project on/off toggle. Suggestion mode is opt-in by navigation.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.
