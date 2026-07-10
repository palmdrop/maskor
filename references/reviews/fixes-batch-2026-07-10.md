# Review: fixes batch (discard/split integrity, multi-tab swap hardening, margin orphan + notes tab, document-links polish)

**Date**: 2026-07-10
**Status**: Resolved
**Scope**: `packages/api`, `packages/storage`, `packages/shared`, `packages/frontend` — `agent/fixes` vs `main`
**Plan**: `references/plans/discard-and-split-integrity.md`, `references/plans/multi-tab-swap-hardening.md`, `references/plans/margin-orphan-and-notes-tab.md`, `references/plans/document-links-polish.md`
**Spec**: `specifications/fragment-editor.md`, `specifications/storage-sync.md`, `specifications/fragment-split.md`, `specifications/sequencer.md`, `specifications/margins.md`, `specifications/document-links.md`

---

## Overall

Four plans, all faithfully implemented, well-commented, and well-tested (`bun run verify` green on this review's checkout). The discard/split backend restructure, the margin notes tab, the transient-orphan gate, and the document-links work are in good shape. **One real bug**: the multi-tab swap hardening's load-bearing conflict guard can be silently defeated because the swap baseline is fingerprinted from the *current* server value at write time rather than the server value the buffer actually diverged from — the exact stale-tab timeline the plan targets re-stamps the baseline and downgrades a true conflict back to a silent auto-apply.

---

## Bugs

### 1. Swap baseline is stamped at write time, so a refetch in a stale dirty tab re-baselines the swap and masks the conflict

`packages/frontend/src/hooks/useEntityContentSwap.ts:154` — `writeSwap` computes `baseHash = hashContent(serverValueRef.current)`, i.e. the server content *at the moment of the write*. But `serverValue` is the shell's `content` prop (`entity-editor-shell.tsx:214`), which comes straight from the fragment query and **advances on refetch even while the buffer is dirty** — buffer authority only stops `ProseEditor`'s content-sync from loading it into the buffer (`prose-editor.tsx:101-106`); it does not freeze the prop.

The plan's own timeline then defeats the guard:

```
tab A: edits based on v1 → swap { content: B1, baseHash: h(v1) }   ✓ conflict detectable
tab B: saves v2
tab A: refocused → react-query refetch → content prop = v2 (buffer stays B1, correctly)
tab A: user types one character → debounced writeSwap → swap { content: B1', baseHash: h(v2) }  ✗
tab A: closed. Reopen: cached.content ≠ v2, but baseHash === h(v2) → isConflict = false
       → shell auto-applies B1' over v2 — silent revert of tab B's work, no banner
```

The page-hide flush has the same failure (it reads `serverValueRef.current` too), so a stale hidden tab that flushed after a refetch also writes a "fresh" baseline under stale bytes. This is precisely the user-reported flow ("I return to a maskor-tab… I make some edits… work that session is lost") that Phase 3 was meant to close. The existing tests only cover the seed side (baseline vs current server at recovery time); no test pins what baseline a write records when `serverValue` advanced under a dirty buffer.

Fix: record the baseline the buffer actually *diverged from*, not the write-time server value. Track a `baselineRef` in the hook that updates to `serverValue` only while the buffer agrees with the server (`currentValue === serverValue`, plus reset on entity change) and stamp `hashContent(baselineRef.current)` on every write. Add a regression test: buffer dirty at v1, `serverValue` rerenders to v2, next write must still carry `h(v1)` so recovery flags the conflict.

---

## Design

### 2. Pair conflict banner claims "never one side without the other", but the shell auto-applies its non-conflicting side before the user chooses

`packages/frontend/src/components/fragments/fragment-editor.tsx:370-385` (pair `isConflict` OR) vs `packages/frontend/src/components/entity-editor-shell.tsx:242-253` — when only the Margin swap conflicts and the fragment swap does not, the shell's recovery effect auto-applies the fragment backup immediately (it checks only its *own* `recovery.isConflict`; `suppressRecoveryBanner` hides the banner, not the apply). The pair banner then shows "Backup conflict… not auto-applied" while the fragment buffer already holds restored backup content and is dirty. End states are coherent ("Restore backup" no-ops the applied side; "Keep server" reverts both), but until the user chooses, the pair is torn — the fragment side shows backup content, the Margin shows server content — contradicting the code comment ("a silent auto-apply of one side alongside an explicit choice on the other would tear the pair") and the spec's atomic-pair intent. Consider having the shell hold back a non-conflicting recovery when the pair is in conflict (e.g. a `holdRecovery` prop reported down, or lift the apply decision to the pair coordinator).

---

## Minor

### 3. `marginDocumentLinks` memo is ineffective — unstable dependency causes per-render link-config dispatches

`packages/frontend/src/components/fragments/fragment-editor.tsx:146-156` — `useDocumentLinks` returns a fresh object literal every render (`useDocumentLinks.ts:86`), so `useMemo(..., [documentLinksApi])` recomputes every render and every consumer downstream sees a new `SlotLinkApi`. Concretely, `RichSlotEditor`/`CodeSlotEditor` effects keyed on `[documentLinks]` (`slot-editor.tsx:969-977`, `:1015-1023`) dispatch a link-config transaction into the TipTap/CM instance on *every* fragment-editor render while a slot editor is active. Depend on the stable fields instead: `[documentLinksApi.lookups, documentLinksApi.entities, documentLinksApi.navigateToLink]` (each is memoized inside the hook).

### 4. Discard: a mid-loop sequence-write failure leaves unplacements applied but unlogged

`packages/api/src/commands/fragments/discard-fragment.ts:28-41` — if `sequences.write` throws for sequence N, sequences 1…N-1 are already rewritten, the command 500s, the fragment is not discarded, and no `fragment:discarded` entry records the partial unplacements. Retrying self-heals (the `isPlaced` check skips already-unplaced sequences), so this is acceptable for now — but it's the same partial-failure shape the split command just got warnings for. Worth a `// TODO:` in the loop, or per-sequence isolation mirroring `split-fragment.ts`.

### 5. `LinkedText` style drift

`packages/frontend/src/components/margins/linked-text.tsx:88-89` — un-braced multi-line `if` body (`if (range.from > cursor)\n  nodes.push(...)`) violates the explicit-braces rule in `references/CODING_STANDARDS.md`.

---

## Non-issues

- **`specifications/_drafts.md` appears to delete the "Obsidian plugin port" stub (and `TODO.md`/plan dates look rewound)** — the branch's merge-base is `607c013`, which predates main's `04eafe6` ("docs: investigate obsidian port"). `git diff main` renders main-only commits as deletions; a real merge into main keeps them. Recommend merging main into `agent/fixes` before further work to quiet the noise (expect a trivial `TODO.md` conflict — both sides annotated the obsidian items).
- **`resolveColumnBlocks` could pin comments forever if a fragment with comments ever truly reported zero blocks** — TipTap/CM always report at least one (empty-paragraph) block for a mounted editor, so an empty incoming list only occurs mid-reload; a genuine full-body deletion leaves a non-empty, marker-less list and orphans promptly. The gate's own comment documents this invariant.
- **`settledBlocksRef` isn't reset on fragment change** — irrelevant: every `FragmentEditor` call site (`FragmentPage`, `PreviewPage`, `OverviewPage`, `SuggestionModePage`) keys the editor by fragment uuid, so `MarginColumn` remounts per fragment.
- **`hashContent` normalizes with `trimEnd()` only (not full `trim()`)** — deliberately mirrors `isTrailingWhitespaceEquivalent` (`buffer-sync.ts:8`), the editor-wide equivalence convention; a leading-whitespace divergence should count as a real change.
- **`command-palette:open` smuggles the target command id as an untyped runtime arg** (`command-palette.ts:19-25`, cast at `entity-editor-shell.tsx:413-420`) — a documented, single-call-site tradeoff to keep the palette-open command void-typed in the catalog; acceptable as is.
- **Unplace-before-discard ordering in `discardFragmentCommand`** — looks inverted at first glance but is load-bearing: discarding first would fire the `fragment_positions` FK cascade and desync index vs YAML. Documented in the command and `references/suggestions.md`.
- **Split Margin migration can duplicate a comment on a mid-migration failure** — intentional direction of the failure mode (duplicate > lost), documented in the command.

---

## Resolution

1. **Fixed** (commit `79b67bb`). `writeSwap` no longer fingerprints the write-time server value; a `baselineRef` tracks the content the buffer diverged from — advancing to `serverValue` only while the buffer agrees with the server, freezing once dirty, and resetting on entity change — and both the debounced write and the page-hide flush stamp `hashContent(baselineRef)`. Regression tests pin that a write carries `h(v1)` after `serverValue` advanced to v2 under a dirty buffer.
2. **Fixed** (commit `8501a67`). The linked fragment ↔ Margin pair no longer auto-applies a non-conflicting side while the other side's backup conflicts. `EntityEditorShell` gained a `holdRecovery` prop (gates auto-apply without marking recovery applied) and reports swap-settled state up; `FragmentEditor` derives a single `holdPairRecovery` that releases only once both sides have settled and neither conflicts. Non-pair shells keep the immediate auto-apply.
3. **Fixed.** Memoized the `useDocumentLinks` return object itself (`packages/frontend/src/lib/document-links/useDocumentLinks.ts`), keyed on its already-memoized fields, so `[documentLinksApi]` is now referentially stable and `marginDocumentLinks` (and the shell's consumers) stop recomputing every render — no more per-render link-config dispatches into active slot editors. Fixed at the source rather than the memo dep-array so every consumer benefits.
4. **Mitigated.** Added a `// TODO:` in the unplace loop (`packages/api/src/commands/fragments/discard-fragment.ts`) documenting the partial-failure shape (a mid-loop `sequences.write` throw leaves earlier unplacements applied but unlogged) and noting that retry self-heals via the `isPlaced` skip; points at `split-fragment.ts`'s per-sequence warning isolation as the pattern if it ever needs a real fix. Loop left unrestructured.
5. **Fixed.** Added explicit braces to every un-braced `if` body in `packages/frontend/src/components/margins/linked-text.tsx` (the flagged multi-line body plus the two guard early-returns and the trailing-text push) per `references/CODING_STANDARDS.md`.
