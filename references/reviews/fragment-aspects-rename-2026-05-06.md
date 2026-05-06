# Review: Fragment aspects rename + dynamic form

**Date**: 2026-05-06
**Scope**: `packages/shared`, `packages/storage`, `packages/api`, `packages/frontend`
**Plan**: `references/plans/fragment-aspects-rename-and-dynamic-form.md`

---

## Overall

Both phases are complete and the implementation matches the plan. The rename is thorough — every call site, type, DB table, migration, generated client, and test has been updated. Phase 2 delivers the dynamic add/remove aspect form. Three minor findings: two stale TODO entries and an unstyled remove button.

---

## Bugs

None.

---

## Design

None.

---

## Minor

### 1. Stale TODO: rename task not marked done

`references/TODO.md:15` — The diff adds a new `[ ] fragments store aspects in "properties", however, this is vague... rename?` entry, but this PR is the rename. The item should be `[x]`.

### 2. Stale TODO: dynamic aspect form not marked done

`references/TODO.md:74` — `[ ] Allow adding new aspects on the fragment editor page` is exactly what Phase 2 delivers. Should be `[x]`.

### 3. Unstyled remove button

`fragment-metadata-form.tsx:216` — The remove button is a bare `<button>x</button>` with no classes. Notes and references don't have per-item remove buttons in the same spot, but when this section is visible it will look out of place. Should at minimum match the icon style used elsewhere in the form (e.g., `TagBadge` remove targets).

---

## Non-issues

- **`for...of` in `upserts.ts`** — the loop runs DB inserts, not accumulation. The `reduce`-over-`for...of` coding standard only applies when building an object; this is correct as-is.
- **`weight` column default absent from migration SQL** — the migration only renames the table. The `.default(0)` on `fragmentAspectsTable.weight` in the Drizzle schema is a Drizzle-layer default; drizzle always provides an explicit weight on insert, so the missing SQLite column default is never reached.
- **`vault.db` not deleted** — the plan listed this as a cleanup step. The new migration (`ALTER TABLE fragment_properties RENAME TO fragment_aspects`) is valid SQLite and will run automatically on the existing DB at next test startup. Not deleting it is safe.
- **`aspectField.key` naming** — the form field is named `key` which shadows React's `key` prop conceptually, but they are different things (`aspectField.key` is the user-land aspect name string; the React key uses `aspectField.id`). The JSX correctly uses `aspectField.id` for the React key.
