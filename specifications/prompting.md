# Spec: Fragment Prompting

**Status**: Draft
**Last updated**: 2026-04-27

---

## Outcome

After finishing work on a fragment, Maskor suggests the next fragment for the user to work on — chosen non-deterministically from their unfinished pool. The user can accept, dismiss, or ask for a different suggestion. This mechanic enforces a non-linear working pattern: the user is nudged toward fragments they might otherwise defer, preventing over-polishing of familiar pieces and under-attention to harder ones.

---

## Scope

### In scope

- When a prompt is surfaced (trigger conditions)
- The eligibility pool: which fragments are candidates
- The selection algorithm: how a suggestion is chosen
- User controls: accept, dismiss, next suggestion
- The cooldown mechanism: preventing recent fragments from being re-surfaced immediately

### Out of scope

- Navigation routing after the user accepts a suggestion (see `navigation.md`)
- The fragment editor itself (see `fragment-editor.md`)
- Sequence-aware surfacing — the prompt does not consider sequence position or fitting score; it is purely about which fragments need work

---

## Philosophy

The prompting mechanism is not a productivity tool. It is a creative tool. The intent is to introduce entropy into the writing process: the user does not choose what to work on next — Maskor does, with randomness. This produces unexpected pairings of fragments in the writer's mind, surfaces forgotten pieces, and prevents the psychological trap of always returning to the "safe" fragments.

The mechanism is opinionated. It reflects Maskor's philosophy that fragment order is derived, not imposed, and that the most interesting creative results often emerge from constraints and surprises. Users who find this disruptive can dismiss prompts or toggle the mechanism off per project.

---

## Behavior

### Trigger conditions

A prompt is surfaced after the user explicitly saves a fragment and navigates away from the editor, or when the user requests the next suggestion directly (e.g. via a keyboard shortcut). A prompt is not shown:

- If the eligible pool is empty (all fragments are finished or discarded).
- If the user has dismissed the prompt and not requested another.

### Eligibility pool

A fragment is eligible for prompting if all of the following are true:

- `isDiscarded === false`
- `readyStatus < 1.0`
- The fragment is not in the cooldown set (see below)

### Behavioral signals

The prompting engine reads per-fragment statistics from the DB. These stats are Maskor-owned, updated incrementally as the user interacts with the app, and are not derived from the action log at query time. They live in a `fragment_stats` table keyed by `fragment_uuid`.

| Stat                   | Description                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `voluntary_open_count` | How many times the user opened this fragment without being prompted (via fragment list or overview tile).             |
| `prompt_accept_count`  | How many times this fragment was accepted from a prompt.                                                              |
| `avoidance_count`      | How many times this fragment was accepted from a prompt but left without any edit (`FRAGMENT_UPDATE` did not follow). |
| `edit_count`           | Total number of saves that included a content or metadata change.                                                     |
| `edit_volume`          | Cumulative character diff across all edits. Rough proxy for how much work has gone into the fragment.                 |

Stats are updated synchronously as the relevant events occur (fragment opened, prompt accepted, edit saved, etc.). They are Maskor-internal — not written to vault files, not exposed in the fragment API response.

**Voluntary open frequency**: A fragment the user frequently seeks out voluntarily is already receiving attention and should be deprioritized in prompting.

**Avoidance**: Repeated prompt-accept-without-edit is a signal that the user either considers the fragment done or does not want to work on it. See `readyStatus nudge` below.

**Edit volume**: A fragment with low `edit_volume` relative to its age in the project may be neglected. A high `edit_count` with high `readyStatus` suggests the fragment is mature.

Behavioral signals are advisory inputs to the selection algorithm, not hard filters. They modulate weights; they do not exclude fragments from the eligible pool.

### Selection algorithm

From the eligible pool, Maskor selects one fragment non-deterministically. The selection is weighted across multiple signals:

- **`readyStatus` weight**: Fragments with lower `readyStatus` are given a slightly higher selection weight. Soft — a fragment at `0.9` is still selectable.
- **Voluntary open frequency penalty**: Fragments the user frequently opens voluntarily are deprioritized — they are already receiving attention.
- **Avoidance penalty**: Repeatedly avoided fragments receive a small selection penalty. They are not excluded, but they become less likely to be surfaced again immediately.
- **Edit volume weight**: Fragments with very low edit volume relative to their age in the project get a small boost — they may be neglected.

The combined result is intentional randomness with a gentle composite bias. This is not a recommendation engine — it is a soft shuffle with memory. The exact weighting formula for each signal is an open question.

### Cooldown

Recently worked-on fragments are excluded from the eligible pool briefly after they were last opened, preventing Maskor from re-surfacing the same fragment the user just finished.

- Cooldown is tracked as a set of fragment UUIDs with timestamps (in-memory, lost on restart).
- A fragment leaves cooldown after N fragments have been opened since it was last surfaced, or after a fixed time window — whichever comes first.
- The exact cooldown window is an open question.

### readyStatus nudge

When a fragment has been avoided a threshold number of times (accepted from a prompt, then immediately left without editing), Maskor surfaces a nudge suggesting the user update its `readyStatus`. The nudge is non-blocking and dismissable.

The intent: if a fragment keeps being skipped, either it is done (`readyStatus` should be `1.0`) or the user actively does not want to work on it (in which case `readyStatus` can be raised to reflect that, or the fragment can be discarded). Without user feedback via `readyStatus`, Maskor has no way to know the intent.

The nudge does not update `readyStatus` automatically — that is always a user action.

### User controls

The prompt is presented as a non-blocking card or overlay. The user can:

- **Accept**: open the suggested fragment in the editor.
- **Next**: dismiss this suggestion and surface a different one from the eligible pool. The dismissed fragment is not added to cooldown — it re-enters the pool immediately.
- **Dismiss**: close the prompt without accepting any suggestion. No fragment is opened. The next prompt trigger will surface a new suggestion.

The prompt is never forced. The user can always navigate manually regardless of the prompt state.

---

## Constraints

- The prompting mechanism has no effect on sequence position or fitting scores. It is purely a working-order aid.
- If all non-discarded fragments have `readyStatus === 1.0`, no prompt is shown.
- The cooldown set is in-memory and lost on server restart. Fragments in cooldown are not persisted.
- Fragment stats are stored in a `fragment_stats` table in the vault DB (`fragment_uuid` as key). They are Maskor-internal: not in vault files, not in the fragment API response, not subject to watcher sync.
- Stats persist across server restarts. They are not re-derivable from the vault — if the DB is wiped, stats reset to zero. This is acceptable; the prompting engine degrades gracefully to readyStatus-only weighting until stats accumulate.
- The mechanism is togglable per project in project config. Default state (on/off) is an open question.
- The `readyStatus` nudge is surfaced in the UI only. It never modifies `readyStatus` automatically.

---

## Prior decisions

- **Soft randomness, not strict randomness**: Pure uniform random selection would be simpler, but weighting toward lower `readyStatus` and behavioral signals produces better creative outcomes.
- **No sequence awareness in prompting**: The prompt does not know or care about the sequence. Surfacing fragments based on fitting scores or arc gaps would couple prompting to the sequencer and disadvantage fragments in poorly-scored positions for non-creative reasons.
- **Signals stored in the DB, not derived from the log**: Fragment stats (`fragment_stats` table) are Maskor-owned counters updated incrementally. Deriving signals by querying the full action log at prompt time would be slow on large projects and couples two unrelated systems. The log exists for observability; the DB is the engine's data source.
- **Avoidance does not exclude, it penalizes**: A repeatedly avoided fragment is not removed from the eligible pool. It remains surfaceable — the user may simply not have been ready to work on it yet. The penalty decays if the fragment is eventually engaged with.
- **readyStatus nudge is informational only**: Maskor suggests; the user decides. Automatic `readyStatus` updates would undermine the principle that the file is always authoritative.

---

## Open questions

- [ ] 2026-04-27 — What is the exact cooldown window? N fragments opened since last surfaced, or a time window? Or both (whichever comes first)?
- [ ] 2026-04-27 — What is the exact weighting formula across signals? How are `readyStatus`, voluntary open frequency, avoidance, and edit volume combined? Should weights be configurable?
- [ ] 2026-04-27 — What is the avoidance threshold for triggering a `readyStatus` nudge? Three avoidances? Five?
- [ ] 2026-04-27 — How does avoidance decay? Does the count reset after a successful edit, or does it fade over time?
- [ ] 2026-04-27 — Is the mechanism on or off by default for a new project?
- [ ] 2026-04-27 — Should the prompt show a brief excerpt or just the fragment title, to help the user decide whether to accept?
- [ ] 2026-04-27 — How far back does the action log signal window extend? Recent N events only, or the full log history?

---

## Acceptance criteria

- After saving and navigating away from a fragment, a prompt is shown if the eligible pool is non-empty.
- The suggested fragment has `readyStatus < 1.0` and `isDiscarded === false`.
- The suggested fragment is not the same as the one the user just finished (cooldown applies).
- Accepting the prompt opens the suggested fragment in the editor.
- Pressing "next" surfaces a different suggestion without adding the dismissed fragment to cooldown.
- Dismissing the prompt closes it without opening any fragment.
- If all non-discarded fragments have `readyStatus === 1.0`, no prompt is shown.
- The prompting mechanism can be disabled per project; when disabled, no prompts are shown.
- A fragment that the user frequently opens voluntarily is surfaced less often by the prompt than one that is rarely visited.
- A fragment accepted from a prompt but left without editing contributes to its avoidance count.
- A fragment that has been avoided a threshold number of times triggers a `readyStatus` nudge in the UI. `readyStatus` is not modified automatically.
