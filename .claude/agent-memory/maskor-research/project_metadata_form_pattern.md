---
name: Metadata form pattern
description: react-hook-form + zod resolver recommended for fragment frontmatter editing in Maskor; field-per-type rendering pattern documented
type: project
---

Fragment metadata (frontmatter fields) should be edited via react-hook-form + `@hookform/resolvers/zod`, not auto-generated from the Zod schema.

**Why:**

- The fragment schema has heterogeneous field types: float 0–1 (readyStatus), string[] (notes, references), and `Record<string, {weight: number}>` (properties, keyed by aspect from the API). Zod-driven auto-generation libraries (e.g. AutoForm) handle simple scalars well but break down on dynamic record keys fetched from an external endpoint.
- The `properties` field (aspect weights) requires a separate API call to get the valid aspect keys — the form must be partially dynamic and cannot be fully static-schema-driven.
- Recommended pattern: define a static Zod schema for the fixed fields; render a manual fieldset for `properties` using `useFieldArray` or a `Object.entries` loop over the aspect list fetched from `/aspects`.
- shadcn/ui's Form component already wraps react-hook-form — Maskor has radix-ui and shadcn in deps, so this slots in naturally.

**Field rendering map:**

- `title`: text input
- `readyStatus`: shadcn Slider (0–1, step 0.01) or number input
- `notes` / `references`: tag-style multi-input (no dep needed — build with useFieldArray)
- `properties`: per-aspect Slider rendered from fetched aspect list

**How to apply:** When building the metadata form component, install `react-hook-form` and `@hookform/resolvers`. Do NOT use AutoForm or schema-to-form generation libraries — they won't handle the dynamic aspect keys cleanly.
