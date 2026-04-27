# Spec: References

**Status**: Draft
**Last updated**: 2026-04-27

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
