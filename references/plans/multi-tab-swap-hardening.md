# Multi-tab swap hardening — stale tabs must never overwrite newer work

**Date**: 04-07-2026
**Status**: In Progress
**Specs**: `specifications/fragment-editor.md`, `specifications/storage-sync.md`
**Branch**: agent/multi-tab-swap-hardening

---

## Goal

> A stale editor session (an old tab re-focused or closed after newer work happened elsewhere) can never overwrite newer content via the swap flush, the dirty backstop, or swap recovery — verified by tests that simulate the stale-tab timeline.

---

## Background (investigated 04-07-2026)

`references/TODO.md`: "loosing work still happens somehow... usually when I continue from an existing session in a tab."

The `never-lose-writing` plan (Done, 25-06-2026) added three defenses that are all **single-tab correct but multi-tab dangerous**:

1. **Page-hide flush** (`useEntityContentSwap.ts`, Phase 4): on `pagehide`/`visibilitychange(hidden)` the tab immediately PUTs its buffer to the swap file. A stale background tab that gets hidden/closed writes its **old** buffer over a swap that may mirror newer edits from another tab.
2. **Dirty backstop** (`prose-editor.tsx`, Phase 2): a 1.5s heartbeat fires `onChange` whenever the live buffer differs from server `content`. If another tab saved newer content, the stale tab's refetch updates `content`, the old buffer now "differs", the backstop marks it dirty → swap writes stale content, Save enables on stale content, and buffer authority then *protects* the stale buffer against refetches.
3. **Swap recovery banner**: offers to restore whatever the swap holds — if (1) or (2) wrote stale content, recovery loops the loss back into the editor.

The 2026-06-17 multi-tab cache fix (buffer authority) addressed refetch clobbering, not these write-side vectors. No cross-tab coordination exists (no BroadcastChannel/localStorage arbitration).

---

## Tasks

### Phase 0 — Branch

- [x] Create branch `agent/multi-tab-swap-hardening` from main. _(2026-07-04)_

### Phase 1 — Reproduce and pin the vectors

- [x] Write characterization tests that simulate the timeline (`useEntityContentSwap.multi-tab.test.ts`, `prose-editor.dirty-backstop.test.tsx`). _(2026-07-04)_
- [x] Trace whether the backstop-vs-refetch race actually occurs. Findings below. _(2026-07-04)_

#### Phase 1 findings (04-07-2026)

Traced the real sequence through `entity-editor-shell.tsx` (`liveContent` sync), `prose-editor.tsx` (content-sync effect + dirty backstop), and `useEntityContentSwap.ts` (debounce + flush + seed). Result: **only one of the three hypothesized vectors is a real, reproducible loss vector.**

- **Vector 3 — swap recovery — REAL (the actual loss).** A swap written from tab A while the server was v1 persists after another tab saves v2. On reopen (new tab / reload), `useEntityContentSwap` offers recovery purely because `cachedContent !== serverValue`; the shell (and the fragment ↔ Margin pair) then **auto-applies** it into the buffer and marks it dirty — silently reverting v2 to v1-based content, with buffer authority then protecting the stale buffer against the next refetch. The recovery banner gives no signal the server moved on. This matches the TODO report ("losing work… continuing from an existing session in a tab"). Reproduced in `useEntityContentSwap.multi-tab.test.ts`.

- **Vector 2 — dirty backstop — DISPROVED (normal path).** The plan feared the backstop would dirty a stale buffer after a refetch. But a **clean** buffer *adopts* the refetched server content: `ProseEditor`'s content-sync effect runs `setContent` while `!isDirty`, and the shell's `liveContent` sync mirrors it. The backstop then compares the buffer against the same advanced content and never fires. Proven in `prose-editor.dirty-backstop.test.tsx` ("does NOT dirty a clean buffer when the server content advances"). Residual edge only: if `setContent` throws (guarded, logged) the buffer stays stale and the backstop would dirty it — rare, and arguably surfacing a genuine divergence; not addressed here.

- **Vector 1 — page-hide flush — NARROWED to the recovery vector.** The flush is baseline-blind: it mirrors whatever the buffer holds (characterized in the Phase 1 test). But at the shell level the buffer only holds content that differs from the *current* server when it is genuinely dirty (real user edits — correct to mirror as a crash net) or during a one-render lag that the debounce cleanup cancels before it fires. So the flush never "overwrites a newer swap with stale content" on its own; its only danger is that the mirrored bytes were diverged from an old baseline — which is exactly Vector 3 at recovery time. Fix therefore lives in recovery, and the flush/debounce crash-net writes are left intact.

**Direction adjustment.** The plan's Phase 2 "baseline-aware *writes*" is downgraded: a behavioral write-side guard would risk dropping a genuinely-dirty crash-net write (Vector 1/2 don't reproduce to justify it). Phase 2 instead only *attaches* the baseline to each write (plumbing for the recovery guard). The load-bearing fix is Phase 3: recovery becomes baseline-aware — a swap whose recorded baseline no longer matches the current server is a **conflict** requiring an explicit user choice, never a silent auto-apply.

### Phase 2 — Fix: baseline-aware swap writes

- [ ] Chosen direction (adjust if Phase 1 disproves it): make swap writes **baseline-aware**. Track the server content (hash or string) the buffer was seeded from; a swap write (debounced or flush) only proceeds when `currentValue` actually diverges from the *seed baseline* — a buffer that merely lags a newer server state is stale, not dirty. The backstop must use the same rule: buffer ≠ seed baseline → genuinely unsaved edits; buffer = seed baseline but ≠ refetched server content → stale, sync buffer instead of dirtying.
- [ ] Ensure a genuinely-dirty-but-stale case (user edited in tab A *and* tab B saved meanwhile) is not silently dropped: that is a real conflict — keep the buffer, keep it dirty, and surface the existing "unsaved changes" affordances; the swap may hold tab A's content but recovery must not silently clobber (see Phase 3).
- [ ] Keep the crash-net property: a single-tab crash still recovers the last keystrokes (do not weaken the debounced write or the flush for the genuinely-dirty case).

### Phase 3 — Recovery guard

- [ ] Swap payload gains the baseline (hash of the server content the buffer diverged from). On recovery offer, when the swap's baseline no longer matches current server content, do not silently apply: show the existing recovery banner in a "conflicting backup" variant that requires explicit user choice (keep server / restore backup). Check the swap schema + `GET /swap` list endpoint for compatibility (additive field; old swaps without a baseline keep today's behavior).
- [ ] Update `specifications/fragment-editor.md` (Buffer authority) and `specifications/storage-sync.md` (swap contract) to document baseline-aware swap semantics.

### Phase 4 — Close out

- [ ] `bun run format` then `bun run verify`; fix all issues.
- [ ] Update the `Shipped` frontmatter of both specs; set plan status; commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Focus hardest on the stale-tab timelines from Phase 1 — they are the regression tests for the actual data loss. Include: stale hidden-tab flush no longer writes; backstop no longer dirties a merely-stale buffer; genuine concurrent-edit conflict keeps the user's buffer and requires explicit recovery choice.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Do NOT edit `references/TODO.md` — the orchestrator session updates it after review.

This touches the exact code the `never-lose-writing` plan hardened (`useEntityContentSwap.ts`, `prose-editor.tsx` backstop). Read that plan's Findings section first; do not regress its tests.
