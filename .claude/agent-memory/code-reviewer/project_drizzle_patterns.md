---
name: Drizzle ORM anti-patterns in this codebase
description: Confirmed bugs and pitfalls with Drizzle ORM + bun:sqlite observed in the storage package
type: project
---

Confirmed anti-patterns as of 2026-04-05 (vault-content-index review):

- **`isNull(col) && notInArray(col, arr)` is silently wrong.** Drizzle SQL builder objects are truthy JS values. The `&&` operator returns the right-hand operand, dropping `isNull()` from the WHERE clause entirely. Always use `and(isNull(col), notInArray(col, arr))` — import `and` from `drizzle-orm`.

- **`notInArray(col, [])` is a no-op in SQLite.** `NOT IN ()` evaluates as always-true, returning all rows. Inverted logic like `notInArray(col, uuids.length > 0 ? [] : [""])` is the wrong way to handle a conditional filter — use `inArray(col, uuids)` for an inclusive filter.

- **bun:sqlite is synchronous.** Marking Drizzle query helpers as `async` when they contain no `await` is misleading. It satisfies a Promise-returning interface but should be commented if intentional future-proofing.

- **No transaction on multi-step writes.** SQLite defaults to autocommit, so each `.run()` is its own fsync. Wrap bulk rebuild operations in `vaultDatabase.transaction(async (tx) => { ... })` for both correctness (atomic partial-write protection) and performance.

**Why:** These bugs pass TypeScript type-checking without error because Drizzle SQL objects are opaque types — the compiler cannot tell you're using `&&` instead of `and()`.

**How to apply:** On any review touching Drizzle WHERE clauses with multiple conditions, always verify `and()`/`or()` wrappers are used instead of JS boolean operators. Check transaction boundaries on any multi-step write operation.
