---
name: Branded UUID casting anti-pattern
description: Using `as never` to satisfy branded UUID types is a recurring pattern to flag
type: project
---

In the API package, `projectId as never` is used to cast string path params to branded `ProjectUUID` type. This silences type checking completely — `as never` tells TypeScript the value is of type `never`, which is assignable to everything. It will not catch future signature changes.

**Why it matters:** `as ProjectUUID` is the correct cast. `as never` is a red flag that the author wasn't sure what the right type was and chose the nuclear option. Any code doing `x as never` should be treated as a potential type safety hole.

**How to apply:** In every review, flag any `as never` cast that is not in a type-level utility function (e.g. `satisfies`, type narrowing helpers). The correct fix for branded types is `value as BrandedType`.

First observed: `packages/api/src/middleware/resolve-project.ts:13` and `packages/api/src/routes/projects.ts:22,48` in 2026-04-06 review.
