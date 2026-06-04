# Spec: Fragment Prompting

**Status**: Stable
**Last updated**: 2026-05-08

**Shipped**:

- 2026-05-07 — Suggestion mode is accessible from the top nav. A fragment from the eligible pool loads directly into the editor; pressing Next auto-saves and surfaces the next suggestion. Recently surfaced fragments enter a cooldown window and are not immediately re-selected. (plan: references/plans/suggestion-mode.md)
- 2026-05-07 — Selection is non-deterministic and weighted: lower readyStatus, low edit count, and infrequently-visited fragments are favored; high-avoidance and frequently-opened fragments are deprioritized. (plan: references/plans/suggestion-mode.md)
- 2026-05-07 — Per-fragment behavioral stats (voluntary open count, prompt accept count, avoidance count, edit count) are persisted in the DB and feed the selection weights. (plan: references/plans/suggestion-mode.md)
- 2026-05-07 — A readyStatus nudge banner appears when a fragment's avoidance count exceeds the configured threshold, prompting the user to raise its readyStatus or discard it. (plan: references/plans/suggestion-mode.md)
- 2026-05-23 - Suggestion page remembers current fragment using query params and project manifest state. The same suggestion will surface until the user explicitly presses next. This makes sure the user can navigate away and back again and keep working on the same fragment.
- 2026-05-26 — Quick-switcher picks made inside suggestion mode now enter cooldown via a dedicated `recordPick` storage path, and carry a "user-picked" flag the avoidance check honors. A picked fragment is not immediately re-surfaceable by the engine, and pressing Next on it does NOT count as avoidance (engine-surfaced picks remain the only avoidance source). (plan: references/plans/quick-switcher.md)
- 2026-06-04 — Back-navigation is fixed: the current-fragment DB pointer is now updated synchronously whenever the displayed fragment changes (including back-nav via browser history). A new `PUT /suggestion/current` endpoint accepts a `fragmentId` body and writes directly to the `project_state` table. The frontend calls this endpoint via a `useEffect` on `fragmentId` changes so the pointer always reflects what's on screen; returning to suggestion mode via the nav link reliably restores the last-viewed fragment, never its predecessor. (plan: `scripts/ralph/archive/2026-06-04-small-improvements/`)

---

## Outcome

Maskor exposes a dedicated **suggestion mode** — a top-nav-accessible page where the user works through one suggested fragment at a time. Each suggestion is chosen non-deterministically from the user's unfinished pool. The user can edit the loaded fragment or press Next to load another. This mechanic enforces a non-linear working pattern: the user is nudged toward fragments they might otherwise defer, preventing over-polishing of familiar pieces and under-attention to harder ones.

**Terminology.** `suggestion mode` is the **developer-facing name** for the page and the code paths around it (route, components, module, types). The **user-facing label** is undecided — the nav-tab label is `Edit` for now. The underlying engine is referred to as "prompting" throughout this spec, and the spec itself remains `prompting.md` because the mechanism predates the UI surface.

---

## Scope

### In scope

- When a suggestion is surfaced (trigger conditions)
- The eligibility pool: which fragments are candidates
- The selection algorithm: how a suggestion is chosen
- The suggestion-mode UI surface and its user controls (Edit, Next, nudge banner)
- The cooldown mechanism, including the fallback when every fragment is cooled
- Fragment stat persistence and the action sites that update it

### Out of scope

- The fragment editor itself, which suggestion mode reuses (see `fragment-editor.md`)
- Sequence-aware surfacing — the mechanism does not consider sequence position or fitting score; it is purely about which fragments need work
- Navigation outside suggestion mode (regular fragment list, overview, links from other entities)

---

## Philosophy

The prompting mechanism is not a productivity tool. It is a creative tool. The intent is to introduce entropy into the writing process: the user does not choose what to work on next — Maskor does, with randomness. This produces unexpected pairings of fragments in the writer's mind, surfaces forgotten pieces, and prevents the psychological trap of always returning to the "safe" fragments.

The mechanism is opinionated. It reflects Maskor's philosophy that fragment order is derived, not imposed, and that the most interesting creative results often emerge from constraints and surprises. Users who find this disruptive simply do not enter suggestion mode — the regular fragment editor remains untouched and is always available for working on a specific chosen fragment.

---

## Behavior

### Trigger conditions

A suggestion is surfaced when the user enters suggestion mode, and again every time the user presses Next inside it. A suggestion is not shown:

- If the eligible pool is empty (all fragments are finished or discarded). The page renders an empty state.

### Eligibility pool

A fragment is eligible for prompting if all of the following are true:

- `isDiscarded === false`
- `readyStatus < 1.0`
- The fragment is not in the cooldown set (see below)

### Behavioral signals

The prompting engine reads per-fragment statistics from the DB. These stats are Maskor-owned, updated incrementally as the user interacts with the app, and are not derived from the action log at query time. They live in a `fragment_stats` table keyed by `fragment_uuid`.

| Stat                   | Description                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voluntary_open_count` | How many times the user explicitly chose this fragment via any user-initiated action (fragment list, overview tile, quick-switcher, deep link, …) — i.e. anything other than the prompting engine surfacing it. Counts in suggestion mode too: a quick-switcher pick while inside suggestion mode increments this stat. |
| `prompt_accept_count`  | How many times this fragment was loaded as a suggestion in suggestion mode.                                                                                                                                                                                                                                             |
| `avoidance_count`      | How many times this fragment was surfaced by the prompting engine in suggestion mode and the user pressed Next without saving any edit (`FRAGMENT_UPDATE` did not follow). Quick-switcher picks that are then skipped do not count — avoidance is specifically the signal that the engine's pick was rejected.          |
| `edit_count`           | Total number of saves that included a content or metadata change.                                                                                                                                                                                                                                                       |

Stats are updated synchronously as the relevant events occur (fragment opened, prompt accepted, edit saved, etc.). They are Maskor-internal — not written to vault files, not exposed in the fragment API response.

**Voluntary open frequency**: A fragment the user frequently seeks out voluntarily — through any explicit choice, including a quick-switcher pick made from inside suggestion mode — is already receiving attention and should be deprioritized in prompting.

**Avoidance**: Repeated load-and-skip-without-edit is a signal that the user either considers the fragment done or does not want to work on it. See `readyStatus nudge` below.

**Edit count**: A fragment with low `edit_count` relative to its age in the project may be neglected. A high `edit_count` with high `readyStatus` suggests the fragment is mature.

Behavioral signals are advisory inputs to the selection algorithm, not hard filters. They modulate weights; they do not exclude fragments from the eligible pool.

### Selection algorithm

From the eligible pool, Maskor selects one fragment non-deterministically. The selection is weighted across multiple signals:

- **`readyStatus` weight**: Fragments with lower `readyStatus` are given a slightly higher selection weight. Soft — a fragment at `0.9` is still selectable.
- **Voluntary open frequency penalty**: Fragments the user frequently opens voluntarily are deprioritized — they are already receiving attention.
- **Avoidance penalty**: Repeatedly avoided fragments receive a small selection penalty. They are not excluded, but they become less likely to be surfaced again immediately.
- **Edit count weight**: Fragments with very low `edit_count` relative to their age in the project get a small boost — they may be neglected.

The combined result is intentional randomness with a gentle composite bias. This is not a recommendation engine — it is a soft shuffle with memory. The exact weighting formula for each signal is an open question.

### Cooldown

Recently surfaced fragments are excluded from the eligible pool briefly, preventing Maskor from re-surfacing the same fragment the user just left.

- Cooldown is tracked as a set of fragment UUIDs with timestamps (in-memory, lost on restart).
- A fragment leaves cooldown after a fixed time window since it was last surfaced.
- **Fallback**: if every eligible fragment is currently in cooldown, the selector falls back to the oldest cooldown entries (sorted ascending by `last_surfaced_at`) with random jitter, rather than returning empty. This guarantees suggestion mode keeps producing suggestions as long as any fragment is eligible.
- The exact cooldown window is an open question.

### readyStatus nudge

When a fragment has been avoided a threshold number of times (loaded in suggestion mode, then skipped via Next without saving any edit), Maskor surfaces an inline nudge banner above the editor inside suggestion mode, suggesting the user update its `readyStatus`. The nudge is non-blocking and dismissable.

The intent: if a fragment keeps being skipped, either it is done (`readyStatus` should be `1.0`) or the user actively does not want to work on it (in which case `readyStatus` can be raised to reflect that, or the fragment can be discarded). Without user feedback via `readyStatus`, Maskor has no way to know the intent.

The nudge does not update `readyStatus` automatically — that is always a user action.

### User controls

Suggestion mode loads the suggested fragment directly into the editor. There is no separate "accept" step — acceptance is implicit in the user editing the fragment. The user can:

- **Edit**: edit the loaded fragment as in any normal fragment editor. Saves use the same path as the regular editor.
- **Next** (button or `Cmd/Ctrl+Enter`): if the loaded fragment has unsaved changes, save them first. Then load another suggestion. If saving fails, Next does not advance and the error is surfaced inline. The previously loaded fragment enters cooldown either way; if it was skipped without any edit save during its time on screen, its `avoidance_count` is incremented.

Suggestion mode is always either showing a suggestion or the empty state, never a separately-dismissable overlay. The mode is never forced — the user can leave at any time, and they retain full access to the regular fragment editor for working on a specific chosen fragment.

---

## Constraints

- The prompting mechanism has no effect on sequence position or fitting scores. It is purely a working-order aid.
- If all non-discarded fragments have `readyStatus === 1.0`, suggestion mode shows the empty state.
- The cooldown set is in-memory and lost on server restart. Fragments in cooldown are not persisted.
- Fragment stats are stored in a `fragment_stats` table in the vault DB (`fragment_uuid` as key). They are Maskor-internal: not in vault files, not in the fragment API response, not subject to watcher sync.
- Stats persist across server restarts. They are not re-derivable from the vault — if the DB is wiped, stats reset to zero. This is acceptable; the prompting engine degrades gracefully to readyStatus-only weighting until stats accumulate.
- Stats may be exposed for inspection via dedicated developer/advanced surfaces (see `specifications/project-statistics.md`) — e.g. a fragment-editor sidebar inspector toggled from project config. Such surfaces do not relax the rules above: they read through a separate stats endpoint, never modify stats, and never appear in vault files or the standard fragment API response.
- Suggestion mode is opt-in by navigation; there is no per-project on/off toggle. Users who do not want prompted editing simply do not enter the mode.
- The `readyStatus` nudge is surfaced in the UI only. It never modifies `readyStatus` automatically.

---

## Prior decisions

- **Dedicated mode, not a popup card**: Earlier drafts modeled prompting as a non-blocking card surfaced after save. That coupled prompting to the save event, made every save trigger UI, and required separate Accept / Next / Dismiss controls. A dedicated suggestion-mode page collapses the action model (edit-and-stay or Next), removes the save-side trigger entirely, and gives prompting its own clear opt-in surface without changing the regular editor's behavior.
- **Soft randomness, not strict randomness**: Pure uniform random selection would be simpler, but weighting toward lower `readyStatus` and behavioral signals produces better creative outcomes.
- **No sequence awareness in prompting**: The mechanism does not know or care about the sequence. Surfacing fragments based on fitting scores or arc gaps would couple prompting to the sequencer and disadvantage fragments in poorly-scored positions for non-creative reasons.
- **Signals stored in the DB, not derived from the log**: Fragment stats (`fragment_stats` table) are Maskor-owned counters updated incrementally. Deriving signals by querying the full action log at prompt time would be slow on large projects and couples two unrelated systems. The log exists for observability; the DB is the engine's data source.
- **Avoidance does not exclude, it penalizes**: A repeatedly avoided fragment is not removed from the eligible pool. It remains surfaceable — the user may simply not have been ready to work on it yet. The penalty decays if the fragment is eventually engaged with.
- **`edit_volume` dropped, `edit_count` retained**: Cumulative character diff is tempting-precise but misleading — large mechanical edits inflate it and deletion-heavy edits look "high volume" while reducing the fragment. `edit_count` is a coarser but more honest signal of attention.
- **No per-project enable/disable**: Earlier drafts treated suggestion mode as a togglable mechanism. Making it a dedicated page removes the need for a toggle: opting in is the act of navigating to the page.
- **Cooldown is time-only with oldest-first fallback**: An earlier draft used "N fragments OR a time window, whichever first." Tracking N adds bookkeeping for little benefit, and the empty-pool case (every fragment cooled) needs explicit handling regardless. Time window plus oldest-first fallback covers both cleanly.
- **readyStatus nudge is informational only**: Maskor suggests; the user decides. Automatic `readyStatus` updates would undermine the principle that the file is always authoritative.

---

## Open questions

- [ ] 2026-05-07 — What is the exact cooldown time window? Initial proposal: 30 minutes.
- [ ] 2026-05-07 — What is the exact weighting formula across `readyStatus`, voluntary open frequency, avoidance, and edit count? Weights are not exposed to users; they live as constants in the prompting module.
- [ ] 2026-05-07 — What is the avoidance threshold for triggering the `readyStatus` nudge? Initial proposal: 3.
- [ ] 2026-05-07 — How does avoidance decay? Does the count reset after a successful edit, or does it fade over time?
- [ ] 2026-05-07 — Final user-facing label for suggestion mode (`Edit` in the nav for now; page title and in-product copy still open). Code identifiers remain `suggestion` regardless.
- [ ] 2026-05-07 — Where does the suggestion module live in the package layout (`packages/storage/src/suggestion`, `packages/sequencer`, or its own package)?

### Resolved (2026-05-07)

- ~~Trigger model: card surfaced after save~~ → dedicated suggestion-mode page; suggestion shown on entry and on Next.
- ~~Should the prompt show a brief excerpt?~~ → moot. Suggestion mode loads the fragment directly into the editor.
- ~~Is the mechanism on or off by default?~~ → no toggle. Suggestion mode is opt-in by navigation.
- ~~Cooldown: N fragments or time window?~~ → time window only, with oldest-first fallback when every fragment is cooled.
- ~~Edit volume signal~~ → dropped; replaced by `edit_count` only.
- ~~Avoidance definition~~ → loading in suggestion mode followed by Next without any saved edit, regardless of how long the fragment was on screen.

---

## Acceptance criteria

- Entering suggestion mode loads a suggested fragment if the eligible pool is non-empty.
- The suggested fragment has `readyStatus < 1.0` and `isDiscarded === false`.
- Pressing Next while a fragment is loaded saves any unsaved edits, then surfaces a different suggestion. The previously loaded fragment enters cooldown and is not the next selection (unless every fragment is cooled — see fallback).
- If all non-discarded fragments have `readyStatus === 1.0`, suggestion mode shows the empty state.
- A fragment that the user frequently opens voluntarily (outside suggestion mode) is surfaced less often than one that is rarely visited.
- A fragment loaded in suggestion mode and skipped via Next without saving any edit has its `avoidance_count` incremented.
- A fragment whose `avoidance_count` has reached the threshold displays a `readyStatus` nudge banner inside suggestion mode when it is loaded. `readyStatus` is not modified automatically.
- When every eligible fragment is in cooldown, suggestion mode still produces a suggestion (oldest-first cooldown entries with random jitter); it does not show the empty state in this case.
