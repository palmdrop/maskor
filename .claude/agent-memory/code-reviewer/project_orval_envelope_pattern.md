---
name: Orval envelope pattern mismatch
description: When orval uses a custom mutator, generated response types are discriminated envelopes {data, status, headers} — but if the mutator returns raw body, types and runtime diverge silently
type: project
---

Orval with a custom `mutator` generates TypeScript types wrapping responses in `{ data: T, status: number, headers: Headers }`. If the mutator returns `response.json()` directly (plain `T`), the runtime value is the raw body — types and runtime are misaligned. Consumer code accessing `.data` will get `undefined` at runtime even though TypeScript considers it valid.

**Why:** Envelope typing is only correct when the mutator returns the full `{ data, status, headers }` shape.

**How to apply:** When reviewing orval setups, verify the custom mutator's return shape matches generated types. Either:

- Return `{ data: await response.json(), status: response.status, headers: response.headers }`, OR
- Configure orval for flat `T` hooks via `useOptions` / `httpClient` config.

Flag consumer code accessing `.length` or index properties on an envelope union — these will silently fail at runtime.
