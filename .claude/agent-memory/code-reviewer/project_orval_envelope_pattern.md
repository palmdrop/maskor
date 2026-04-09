---
name: Orval envelope pattern mismatch
description: When orval uses a custom mutator, generated response types are discriminated envelopes {data, status, headers} — but if the mutator returns raw body, types and runtime diverge silently
type: project
---

When orval generates hooks with a custom `mutator`, the generated TypeScript types wrap responses in a discriminated union envelope (`{ data: T, status: number, headers: Headers }`). However, if the custom fetch mutator returns `response.json()` directly (plain `T`), the runtime value is the raw body — not the envelope. The types and runtime are misaligned.

**Why:** Orval's envelope typing is only correct when the mutator returns the full `{ data, status, headers }` shape. If the mutator returns a plain body, consumer code accessing `.data` will get `undefined` at runtime even though TypeScript believes it is valid.

**How to apply:** When reviewing or writing orval codegen setups, always verify the custom mutator's return shape matches what the generated types expect. Either:

- Make the mutator return `{ data: await response.json(), status: response.status, headers: response.headers }` to match the envelope, OR
- Configure orval to generate flat `T` hooks (not envelope) using `useOptions` or `httpClient` config.

Also flag that consumer code accessing `.length` or index properties on what TypeScript types as an envelope union will silently fail at runtime.
