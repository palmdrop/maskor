---
name: Test assertion anti-pattern — unawaited rejects
description: Recurring Bun test pattern where .rejects chains are not awaited, making assertions hollow
type: feedback
---

In Bun's test runner, `expect(promise).rejects.toThrow()` (without `await`) may not actually assert — if the promise resolves, the test passes silently. Always use `await expect(promise).rejects.toBeInstanceOf(...)`.

**Why:** Observed in `registry.test.ts` and `storage-service.test.ts` in the sessions-and-projects implementation (2026-04-05). Four tests were silently non-asserting.

**How to apply:** Flag any `.rejects` usage without `await` in future test reviews. This is a likely recurring mistake since the pattern is easy to miss.
