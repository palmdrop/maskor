# Spec Refinement

**Date**: 27-04-2026
**Status**: Done
**Implemented At**: 27-04-2026

---

## Goal

> Identify and fix contradictions, stale references, missing specs, and unresolved blocking decisions across `specifications/` before those gaps become implementation bugs.

---

## Phases

### Phase 1 — Fix contradictions and stale references

Concrete, targeted edits to existing specs. These are inconsistencies that already exist.

**1.1 — Stale `movement: number[]` reference in `fitting-score.md`**

`fitting-score.md` still asks "How does the arc curve interpolate across positions? The `movement: number[]` array length may not equal the sequence length." But `aspect-arc-model.md` and `project-config.md` have already resolved arc representation as sparse control points `{ x, y }`. The `movement` array is a dead concept.

Action: Replace the open question in `fitting-score.md` with the resolved control-point model. State that interpolation method (linear vs. cubic spline) is a sequencer concern — which is already noted in `aspect-arc-model.md`.

**1.2 — `updatedAt` resolved in storage-sync but still open in fragment-model**

`storage-sync.md` resolved this: "`fromFile` falls back to `new Date()` (sync time) when `updatedAt` is absent from frontmatter." `fragment-model.md` still lists it as an open question.

Action: Mark the question as resolved in `fragment-model.md` and reference the storage-sync resolution.

**1.3 — Arc storage is unresolved across three specs**

`aspect-arc-model.md`, `project-config.md`, and `interleaving.md` give three different stories:

- `interleaving.md` settles on `<vault>/.maskor/config/interleaving.yaml` (vault-stored).
- `aspect-arc-model.md` leaves arc storage as an open question.
- `project-config.md` marks arc storage as TBD.

This asymmetry has no justification: arcs and interleaving config are both user-authored intent, both belong to the project, and both should live or not live in the vault by the same reasoning.

Action: Decide and document arc storage in `aspect-arc-model.md`. Store arcs in `<vault>/.maskor/config/arcs/`. Update `project-config.md` to reference the resolution. Resolve the open question in all three specs consistently.

**1.4 — `isComplete` / `isPlaced` derived states never replaced**

`fragment-model.md` notes these were removed with pool and have no replacement. `sequencer.md` and `overview.md` implicitly rely on `isPlaced` to differentiate placed from unplaced fragments (the "unassigned pool" concept). The gap is growing.

Action: Define `isPlaced` as a derived property in `fragment-model.md` — derived from sequence membership (a fragment is placed if it has a position in any sequence). Document this clearly so the sequencer and overview specs can reference it.

---

### Phase 2 — Resolve high-priority blocking open questions

These open questions in downstream specs cannot be answered without first deciding something in an upstream spec. They should be resolved now, before implementation begins.

**2.1 — Fitting score range and noise dependency**

`fitting-score.md` leaves the score range open. `sequencer.md` applies seeded noise on top of the score. A noise range that is "user-defined min/max offset" has no meaning unless the base score has a known range.

Action: Decide on a normalized 0–1 range for fitting scores and record this as a prior decision in `fitting-score.md`. Update `sequencer.md` to state that noise offsets are applied in the same 0–1 range.

Please note that noise offsets is an optional feature that the user may or may not want to use.

**2.2 — Fragment with no weight for an aspect that has an arc**

This is an open question in both `fitting-score.md` and `aspect-arc-model.md`. It's a core behavior question: is a fragment with no weight for an arc'd aspect treated as weight=0 (maximum penalty) or ignored (no score contribution)?

The answer has real product implications: treat-as-zero means fragments without an explicit aspect assignment are pushed away from arc peaks, which could be useful for forcing specificity. Ignore means aspects are purely opt-in, which is more forgiving. Neither is obviously correct.

Action: Ignore (no weight = no contribution). Rationale: fragments are often about one or two things; penalizing them for not being about every arc'd aspect would make the score noise-dominated. Record the decision in `fitting-score.md` and `aspect-arc-model.md`.

**2.3 — Arc ↔ aspect relationship (1:1 or optional)**

`aspect-arc-model.md` asks: "Is the arc ↔ aspect relationship strictly 1:1, or can an aspect have no arc?" This is still open. The spec body already implies an arc is optional ("An aspect without an arc has no intensity target — its fragments are placed freely from a structural standpoint"), but it isn't marked as resolved.

Action: Mark this resolved. Confirm: an aspect can have zero or one arc. Multiple aspects cannot share one arc (arcs are per-aspect). Record in `aspect-arc-model.md`.

**2.4 — Key fragment definition**

`sequencer.md` leaves "rough position" undefined: "Is it a specific index, a percentage of total sequence length, or a named anchor (first/last/middle)?" This blocks the acceptance criterion that says "A key fragment always appears within its designated positional range."

Action: Define key position as a normalized value (0–1, matching arc curve x-axis convention) with a user-defined tolerance radius (also 0–1). This is consistent with the rest of the positional model and needs no separate concept.

**2.5 — Fitting score hard requirement penalty**

`fitting-score.md` asks whether a violated constraint is a zero score, large negative offset, or infinity (exclusion). This matters because the sequencer needs to know whether to score or simply exclude.

Action: Use exclusion (the fragment is removed from the candidate set before scoring, not assigned a penalty score). This is simpler to reason about and consistent with how interleaving hard rules work. Record in `fitting-score.md`.

---

### Phase 3 — Consolidate Notes and References specs

`references.md` itself states: "References and Notes are structurally identical." The two specs are near-duplicate. They share: vault sync rules, orphan warning behavior, fragment attachment behavior, join key semantics (title/name), and the "no auto-repair" policy. Maintaining two specs for the same structure creates drift risk.

**Push-back on keeping them fully separate**: The semantic distinction (internal thought vs. external source) is valid at the product level, but does not justify two independent specs. The better model is a short shared base section plus a thin specialization layer per type.

Action: Refactor. Merge the structural behavior into a single section (or a new `specifications/attachments.md` spec). Keep `notes.md` and `references.md` as thin stubs that state their semantic purpose and defer to the shared base for structural rules. This is also the right time to settle the common open questions that appear in both files identically:

- Frontmatter schema (UUID and title, updatedAt and createdAt)
- Multi-fragment attachment (fragments can have many notes and many references)
- Deletion warning (warn if attached)

---

### Phase 4 — Fill missing specs

These concepts are referenced by existing specs but have no spec of their own.

**4.1 — Navigation / Shell spec**

Multiple specs mention a navigation layer that doesn't exist as a spec:

- `fragment-editor.md`: "Fragment selection / random presentation: What drives which fragment is shown? The editor doesn't own this — but the spec for the session/navigation layer is not yet written."
- `fragment-model.md`: The prompting mechanism (random fragment surfacing) is deferred here.
- The overview and fragment editor specs have no story for how the user moves between them.

Action: Write `specifications/navigation.md`. Cover: view structure, how the user moves between the overview, fragment editor, and project config, the fragment selection/surfacing model (including the prompting mechanism intent), and keyboard navigation entry points.

**4.2 — Arc storage spec (if not resolved into aspect-arc-model in Phase 1)**

If Phase 1.3 decides arcs are vault-stored, document the concrete file format and path in `aspect-arc-model.md` or in a dedicated arc storage section of `project-config.md`. The storage-sync spec will need a corresponding scope expansion once this is settled.

**4.3 — DB schema spec (or section)**

Both `overview.md` and `sequencer.md` note "DB schema for sequences/sections/fragment positions is not yet defined." This is a shared blocking dependency. Rather than leaving it as an open question in both specs, add a section to `sequencer.md` (since the sequencer owns sequence structure) that defines the required DB tables: sequences, sections, fragment_positions, fitting_scores. This doesn't need to be a separate spec — it belongs in `sequencer.md` as a storage constraint section.

---

### Phase 5 — Minor clarifications and audit

Smaller issues that are worth fixing but don't block other phases.

**5.1 — `readyStatus` suggestion mechanism**: `fragment-model.md` says "Maskor may suggest a value." No spec defines how. Either add a note that suggestion is purely future-deferred with no current product impact, or remove the claim. The current wording sets a false expectation.

- DEVELOPER NOTE: This is simply a mistake. Maskor should set a default `readyStatus` value but not suggest one. There is no mechanism for detecting how "done" a fragment is. That is up to the author.

**5.2 — Undo of `FRAGMENT_CREATE`**: `action-log.md` says undo moves the fragment to discarded. But the fragment lifecycle in `fragment-model.md` treats discarded as a user-intentional state. A fragment that was just undo-created and is now in discarded is unexpected. Clarify: does undo-create hard-delete the fragment (since it was just created and has no user content), or does it move it to discarded as a safe fallback? If the latter, note that the user may find "ghost" fragments in their discarded folder.

- DEVELOPER NOTE: Undoing create is maybe not possible. It seems like an uncommon flow that might surprise the user.

**5.3 — Arc creation ownership**: `aspect-arc-model.md` asks "Who creates arcs — does the user create them explicitly, or does Maskor auto-generate one per aspect?" The spec body implies user-authored, but this should be resolved and stated explicitly. Recommendation: explicit creation only. Auto-generating a flat arc for every aspect would pollute the config with noise for aspects the user hasn't thought about structurally.

**5.4 — Cross-link audit**: After all edits, verify that cross-references between specs (e.g. "see `sequencer.md`", "see `aspect-arc-model.md`") point to sections that actually exist and say what the referring spec claims. Several open questions are already resolved in one spec but not referenced from the spec that originally asked the question.

- DEVELOPER NOTE: Also, make sure to add appropriate links across files. If one spec is highly relevant to another, add a `<specification>.md` link to the other spec.

**5.5 — "Secondary sequences" split across sequencer and interleaving**: The concept is defined in `sequencer.md` and referenced/used in `interleaving.md`. The ownership is correctly in `sequencer.md`. But `interleaving.md` should be updated to explicitly reference `sequencer.md` for the secondary sequence data model rather than re-describing it. Currently both files describe secondary sequences independently; keeping the definition in one place reduces drift.
