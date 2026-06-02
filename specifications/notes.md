# Spec: Notes

**Status**: Stable
**Last updated**: 2026-06-02

**Shipped**:

- 2026-06-02 — Notes became project-scope: the fragment notes attachment was removed (ADR 0007). Notes are surfaced via `[[document-links]]`/backlinks; fragment-level thinking moved to the Margin. (plan: references/plans/margins.md, Phase 8)
- 2026-04-30 — Notes can be created and deleted from the project config page. (plan: references/plans/project-config-page.md)
- 2026-05-09 — Note field edits are committed immediately with optimistic UI and recorded in the action log. (plan: references/plans/entity-live-metadata-save.md)

---

## Outcome

Notes are the user's own free-text documents — observations, drafts, questions, working thoughts. They are **project-scope** vault files: human-readable, independent of the DB, and surfaced/connected via `[[document-links]]` and backlinks. (Notes are no longer attached to fragments — that fragment-level role moved to the Margin; see ADR 0007 and `specifications/margins.md`. For thoughts about a specific fragment, use its Margin.)

---

## Semantic purpose

A note is an internal document authored by the user. It represents the user's own thinking about the project, a fragment, or anything else. It is not a reference to external material — that is what `references.md` is for.

The distinction is semantic and product-level. Structurally, notes are identical to references. See `attachments.md` for the shared rules: lifecycle, vault storage, DB sync, orphan handling, frontmatter schema, and prior decisions. Note that fragment **attachment** applies to references only — notes are project-scope (ADR 0007).

---

## Note-specific details

- Vault path: `notes/<title>.md`
- Notes are project-scope: they are not attached to fragments and have no fragment frontmatter list. They surface via `[[document-links]]` and backlinks. (Fragment-level notes live in the fragment's Margin — `specifications/margins.md`.)
