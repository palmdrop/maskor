# @maskor/shared

Shared types and utilities used across all Maskor packages.

---

## Domain types

| Type                        | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `Fragment` / `FragmentUUID` | Core unit of writing                                                        |
| `Aspect`                    | A thematic dimension (e.g. grief, city)                                     |
| `Note`                      | Freeform note attached to a fragment                                        |
| `Reference`                 | External source referenced by a fragment                                    |
| `Piece`                     | Raw drop-in file before conversion to a fragment                            |
| `Project` / `ProjectUUID`   | A named project backed by an Obsidian vault (`vaultPath`)                   |
| `User` / `UserUUID`         | User identity (single local user for now)                                   |
| `Pool`                      | Fragment lifecycle stage (`unprocessed`, `unplaced`, `placed`, `discarded`) |
| `Sequence` / `Arc`          | Ordering and grouping constructs                                            |

## Utilities

- `slugify(text)` — converts a title to a filesystem-safe slug

---

## Tests

```
bun test --cwd packages/shared
```
