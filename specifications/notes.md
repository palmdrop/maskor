# Spec: Notes

**Status**: Stable
**Last updated**: 2026-04-27

**Shipped**:

- 2026-04-30 — Notes can be created and deleted from the project config page. (plan: references/plans/project-config-page.md)
- 2026-05-09 — Note field edits are committed immediately with optimistic UI and recorded in the action log. (plan: references/plans/entity-live-metadata-save.md)

---

## Outcome

Notes are the user's own free-text documents — observations, drafts, questions, working thoughts — that can be attached to fragments. They are vault files: human-readable and independent of the DB.

---

## Semantic purpose

A note is an internal document authored by the user. It represents the user's own thinking about the project, a fragment, or anything else. It is not a reference to external material — that is what `references.md` is for.

The distinction is semantic and product-level. Structurally, notes are identical to references. See `attachments.md` for all shared rules: lifecycle, vault storage, DB sync, fragment attachment, orphan handling, frontmatter schema, and prior decisions.

---

## Note-specific details

- Vault path: `notes/<title>.md`
- The fragment frontmatter field is `notes` — a list of note titles.
- Notes are displayed in a dedicated "Notes" section of the fragment editor sidebar, distinct from references.
