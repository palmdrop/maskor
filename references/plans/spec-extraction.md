# Plan: Spec Extraction and Spec-Driven Development Setup

**Date**: 22-04-2026
**Status**: Todo

---

## Goal

Establish a `specifications/` directory containing hand-authored, AI-assisted spec files — one per feature or domain. These specs serve as contracts for AI-assisted development sessions: what a feature must do, what it must not do, and what decisions have already been made.

**Not the goal:** migrating or converting existing files. Existing docs (`project_specs.md`, `references/`) stay as-is. Specs are new, intentional documents that synthesize existing material and your own design thinking.

---

## Source material

Before writing any spec, familiarise yourself with the following:

| File                             | What it contains                                                      |
| -------------------------------- | --------------------------------------------------------------------- |
| `project_specs.md`               | Domain model, vocabulary, architecture overview                       |
| `references/ARCHITECTURE.md`     | Data flow, field ownership, package roles, open/settled decisions     |
| `references/SYNC_CONTRACT.md`    | Vault ↔ DB sync rules                                                 |
| `references/TODO.md`             | Open tasks, unsettled questions, in-progress ideas                    |
| `references/suggestions.md`      | Flagged issues and actionable suggestions                             |
| `references/plans/`              | Existing implementation plans — useful for "prior decisions" sections |
| `references/CODING_STANDARDS.md` | Constraints applicable to all specs                                   |

---

## Specs to create

Based on the domain model and current build state. Ordered roughly by dependency and importance.

| Spec file             | Domain / feature                                                        | Notes                                             |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| `storage-sync.md`     | Vault ↔ DB sync contract                                                | Mostly settled — good first spec to anchor others |
| `fragment-model.md`   | Fragment entity, lifecycle, field ownership                             | Core domain                                       |
| `aspect-arc-model.md` | Aspects, arcs, intensity — the data model                               | Not the UI                                        |
| `fragment-editor.md`  | Fragment editor UX — what it shows, owns, and does not own              | Core product feature                              |
| `sequencer.md`        | Placement engine, fitting, noise, manual/semi/auto modes                | Largely unbuilt                                   |
| `interleaving.md`     | Algorithm inputs, constraints, rules                                    | Most open-ended                                   |
| `project-config.md`   | Project setup — aspects, arcs, interleaving config                      | Partially unbuilt                                 |
| `fitting-score.md`    | Calculates a score based on how well a fragment is placed in a sequence | Unbuilt                                           |
| `overview.md`         | Overview view — arc/aspect inspection, sequence visualisation           | Unbuilt                                           |
| `import-pipeline.md`  | Pieces → fragments, external file import                                | Partially unbuilt                                 |
| `export.md`           | Fragment sequence → text, PDF, Word                                     | Unbuilt                                           |

Do not feel obligated to write all specs before starting development. Write a spec when you are about to plan or build that feature.

---

## Workflow

Each spec follows this four-phase collaboration:

```
[AI] Raw extraction → [Human] Intent layer → [AI] Draft → [Human] Final spec
```

### Phase 1 — AI: raw extraction

Ask the AI to mine the source material and produce a structured dump:

- All mentions of the domain/feature across source files
- Settled decisions relevant to this spec
- Open questions flagged in existing docs
- Constraints that apply
- Anything surprising or contradictory

**Prompt template:**

> "I'm writing a spec for `[feature]`. Mine `project_specs.md`, `references/ARCHITECTURE.md`, `references/TODO.md`, and any relevant plans in `references/plans/`. Produce a structured dump: settled decisions, open questions, constraints, and anything inconsistent. Do not write the spec yet."

### Phase 2 — Human: intent layer

Before the AI drafts anything, you add:

- The outcome in your own words — what "done" feels like
- Explicit out-of-scope items (these are the hardest and most valuable)
- Any design ideas or preferences not in the existing docs
- Which open questions you want resolved now vs. left open

This is the part AI cannot do for you. It requires authorial intent.

### Phase 3 — AI: draft spec

With the extraction and your intent layer in hand, ask the AI to produce a draft using `specifications/_template.md`.

**Prompt template:**

> "Using the extraction above and my intent notes, draft a spec for `[feature]` following `specifications/_template.md`. Write only what is clearly established or what I've explicitly stated. Mark uncertain items as open questions."

### Phase 4 — Human: final spec

Read the draft critically. Rewrite in your own voice. The spec should read like something you wrote, not something generated. Focus especially on:

- Outcome — is it honest about what you're actually building?
- Out-of-scope — are you closing doors you mean to close?
- Open questions — are any of these actually decided? Remove them if so.
- Acceptance criteria — are these observable without running tests?

Save the final file to `specifications/[name].md`. Update status to `Stable`.

---

## PROMPT.md — session bootstrapper

Inspired by the Ralph technique. A single file at the repo root that replaces re-explaining context at the start of every AI session. Keep it short — its job is to orient, not to document.

**Contents:**

```markdown
# Current focus

[One sentence: what are you working on right now?]

## Active spec

@specifications/[current-spec].md

## Active plan

@references/plans/[current-plan].md

## Key context

@references/ARCHITECTURE.md
@specifications/vision.md
```

**Rules:**

- Update it at the start of each session, not the end — it reflects current focus, not completed work.
- Never let it grow beyond ~20 lines. If it needs more, the session scope is too broad.
- It is not a permanent document. It is a cursor. Content belongs in specs, plans, or architecture docs — not here.
- When switching focus, update it immediately. A stale `PROMPT.md` is worse than none.

**Usage:** Start a session by saying "read PROMPT.md and orient yourself" before describing the task.

---

## Ongoing maintenance

- Update a spec's **status** when implementation begins (`In progress`) and when complete (`Implemented`).
- When a plan in `references/plans/` is implemented, check if its decisions should be back-ported to the relevant spec's **Prior decisions** section.
- When `references/ARCHITECTURE.md` is updated, check if any specs need updating too.
- Specs are not exhaustive — they document intent and constraints, not every detail. Keep them short.

---

## What specs are NOT for

- Implementation instructions (that's what plans are for)
- Test specifications (acceptance criteria are observable outcomes, not test code)
- Architecture documentation (that stays in `references/ARCHITECTURE.md`)
- Task tracking (that stays in `references/TODO.md` and plans)
