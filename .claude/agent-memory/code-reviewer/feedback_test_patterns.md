---
name: Test assertion anti-pattern — unawaited rejects
description: Recurring Bun test pattern where .rejects chains are not awaited, making assertions hollow
type: feedback
---

In Bun's test runner, `expect(promise).rejects.toThrow()` without `await` silently passes even if the promise resolves. Always use `await expect(promise).rejects.toBeInstanceOf(...)`.

**Why:** Observed in `registry.test.ts`, `storage-service.test.ts`, and `vault.test.ts` (2026-04-05). Recurring across multiple files.

**How to apply:** Flag any `.rejects` without `await`. Also flag abbreviated lambda params in tests (`f`, `a`, `n`, `refs`) — they recur in test callbacks even when fixed in production code.
