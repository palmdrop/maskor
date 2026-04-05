---
name: Test assertion anti-pattern — unawaited rejects
description: Recurring Bun test pattern where .rejects chains are not awaited, making assertions hollow
type: feedback
---

In Bun's test runner, `expect(promise).rejects.toThrow()` (without `await`) may not actually assert — if the promise resolves, the test passes silently. Always use `await expect(promise).rejects.toBeInstanceOf(...)`.

**Why:** Observed in `registry.test.ts` and `storage-service.test.ts` (2026-04-05) and again in `vault.test.ts` (structural-debt review 2026-04-05). Recurring across multiple test files.

**How to apply:** Flag any `.rejects` usage without `await` in future test reviews. This is a likely recurring mistake since the pattern is easy to miss. Also flag abbreviated lambda params in tests (`f`, `a`, `n`, `refs`) — they appear consistently in test callbacks even when fixed in production code.
