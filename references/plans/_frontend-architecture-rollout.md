# Frontend Architecture Refactor — Rollout

**Date**: 10-06-2026
**Status**: Todo

> Meta-plan. Coordinates the four refactor plans from the frontend architecture review. Not a task list of its own — it sequences the others and records the cross-plan notes. Each linked plan owns its phases, tests, and commits.

---

## The four plans

| # | Plan | What it does | Review findings |
|---|------|--------------|-----------------|
| 1 | [`optimistic-mutation-primitive.md`](optimistic-mutation-primitive.md) | `useOptimisticMutation` primitive; `useSequenceMutations` + entity editors routed through it; registry-driven `useEntityEditor`; shell insert/extract extracted; `unwrap` + QuickSwitcher + import-options cleanups | 1, 2, 3b (+ incidental dedups) |
| 2 | [`project-settings-consolidation.md`](project-settings-consolidation.md) | `useProjectSetting` (write-half of `useProjectEditorConfig`) + `SettingRow`; retires duplicated save/mirror logic in GeneralTab and EntityEditorShell | 4, 5 |
| 3 | [`overview-surface-hooks.md`](overview-surface-hooks.md) | Extract `useFragmentSelection` + `useSectionOps` from the 824-line OverviewPage | 3a |
| 4 | [`prose-editor-backend-adapters.md`](prose-editor-backend-adapters.md) | Split the CodeMirror / TipTap backends behind `ProseEditorHandle` into two adapters | 2nd-pass |

---

## Recommended order

1. **Plan 1 — optimistic-mutation-primitive.** First. It is the foundation: it settles the editor/mutation layer the others sit beside, and it has the only hard internal ordering (primitive → registry → `useEntityEditor` → editor migrations → insert/extract). Each of its phases is independently shippable.
2. **Plan 2 — project-settings-consolidation.** Second. See the EntityEditorShell note below — sequence it after Plan 1.
3. **Plan 3 — overview-surface-hooks.** Third. Independent; calls the existing `useSequenceMutations` interface unchanged.
4. **Plan 4 — prose-editor-backend-adapters.** Any time — fully orthogonal (touches only `prose-editor`). Can run first as a low-risk warm-up, or last, or in parallel.

---

## Cross-plan notes

- **EntityEditorShell is the one shared file.** Plan 1 (Phase 7) removes the insert/extract orchestration; Plan 2 (Phase 4) removes the display-settings mirror cluster. The regions are disjoint, but doing **Plan 1 before Plan 2** avoids churning the same file from two branches at once.
- **`useSequenceMutations` is read by Plan 3, rewritten by Plan 1.** No conflict — Plan 1 edits `useSequenceMutations.ts`; Plan 3 edits `OverviewPage` + new hook files and consumes the mutations' public interface, which is unchanged. Doing Plan 1 first just means Plan 3 builds on the cleaned version.
- **No "must do together" pairs.** Every plan is independently valuable and shippable on its own branch. The only coupling is the EntityEditorShell sequencing above.
- **Plan 4 is the safe parallelizable one** if more than one person/agent is working — it shares no files with 1–3.

---

## Discipline (applies to every plan)

- One branch per plan, named after the plan; `git commit` per phase.
- Run `bun run format` then `bun run verify` before closing each plan; fix lint/type/test failures before moving on.
- `bun run verify` must be green before starting the next plan in the order.
- These are pure refactors with no behavior change — existing tests are the regression guard, and new tests target the extracted seams (the primitive, the setting hook, the selection/section-ops hooks, the editor adapters). No spec `shipped` frontmatter changes unless behavior shifts (treat that as a scope signal).

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer. When implementation begins, follow the order above; mark this meta-plan `In progress`, and `Done` once all four linked plans are closed.
