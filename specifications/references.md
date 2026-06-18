# Spec: References

**Status**: Stable
**Last updated**: 2026-04-27

**Shipped**:

- 2026-04-30 — References can be created and deleted from the project config page. (plan: references/plans/project-config-page.md)
- 2026-05-09 — Reference field edits are committed immediately with optimistic UI and recorded in the action log. (plan: references/plans/entity-live-metadata-save.md)
- 2026-06-18 — Inline create-and-attach from the fragment editor: typing a new key into the fragment metadata form's reference combobox and confirming the "Create" affordance mints a reference (empty body) and attaches it in one step, without navigating to project config — mirroring the existing aspect create-and-attach flow.

---

## Outcome

References are named entries pointing to or summarizing external source material — books, articles, films, URLs, quotes, or anything outside the project. They can be attached to fragments. They are vault files: human-readable and independent of the DB.

---

## Semantic purpose

A reference is an external document: something the user is drawing from, inspired by, or citing. It is not the user's own thinking — that is what `notes.md` is for.

The distinction is semantic and product-level. Structurally, references are identical to notes. See `attachments.md` for all shared rules: lifecycle, vault storage, DB sync, fragment attachment, orphan handling, frontmatter schema, and prior decisions.

---

## Reference-specific details

- Vault path: `references/<name>.md`
- The fragment frontmatter field is `references` — a list of reference names.
- References are displayed in a dedicated "References" section of the fragment editor sidebar, distinct from notes.
- Typical body content: citation, URL, synopsis, relevant quote. No enforced schema — free-form markdown.
