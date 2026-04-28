# Review: [Feature / area name]

**Date**: YYYY-MM-DD
**Scope**: `packages/...`
**Plan**: `references/plans/....md` <!-- omit if no plan -->
**Spec**: `specifications/....md` <!-- omit if no spec -->

---

## Overall

<!-- One short paragraph: does the implementation match the goal? Call out the most important finding upfront. -->

---

## Bugs

<!-- Real defects — wrong behavior, broken invariants, data loss risk. Each gets its own numbered entry. -->
<!-- If none, write "None." and remove the subsections. -->

### 1. Title

`file.tsx:line` — description of what goes wrong and why. Include a sequence diagram or code snippet when the failure mode is non-obvious.

```
cause → intermediate state → wrong outcome
```

Fix: one sentence on the correct approach.

---

## Design

<!-- Structural issues that aren't bugs but will cause pain: wrong abstractions, missing states, unclear contracts. -->
<!-- If none, write "None." and remove the subsections. -->

### 3. Title

`file.tsx:line` — description and consequence.

---

## Minor

<!-- Inconsistencies, style drift, missing memoization, edge cases that probably won't fire. -->
<!-- If none, write "None." and remove the subsections. -->

### 5. Title

`file.tsx:line` — brief note.

---

## Non-issues

<!--
Patterns that look suspicious but are intentional or correct. Include these to prevent re-flagging in future
reviews. Format as a flat bullet list.
-->

- **Pattern name** — why it's fine.
