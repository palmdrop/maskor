# Review: Editable piece-1 key in the split dialog

**Date**: 2026-07-15
**Status**: Resolved
**Scope**: commits `70c4398e` (feat) + `cc5f3f82` (docs); `packages/api/src/commands/fragments/split-fragment.ts`, `packages/api/src/schemas/split.ts`, `packages/frontend/src/components/fragments/SplitFragmentDialog.tsx`
**Spec**: `specifications/fragment-split.md` (Shipped 2026-07-15, piece-1 key entry)

---

## Overall

Solid. The implementation matches the spec's Shipped entry: `pieceKeys` accepts `pieceIndex: 1`, the override wins over the automatic stripped-heading rename, resubmitting the original's own key is a no-op, collisions reject in Phase A before any write, and the old key stays reserved mid-split so later derived keys suffix instead of clobbering the not-yet-renamed original. Validation ordering (resolve every key before the first write) is preserved. Tests cover the five interesting paths, including the subtle old-key-reservation case. Both touched suites pass (36 + 18). One low-severity reporting bug around case-only renames; the rest is minor. The docs commit (`cc5f3f82`) is a suggestions note plus prettier fallout — nothing to review.

---

## Bugs

### 1. Case-only piece-1 rename executes on disk but is reported as "no rename"

`packages/api/src/commands/fragments/split-fragment.ts:195` — `renamed` compares lowercased (`key.toLowerCase() !== original.key.toLowerCase()`), but the storage layer compares case-sensitively: `storage-service.ts:1081` (`oldKey !== fragmentToWrite.key`) triggers the full cascade — case-safe file rename, Margin rename, vault-wide `[[fragments/oldKey]]` link rewrite — for a case-only change.

```
override "My-Key" on original "my-key"
→ renamed: false → originalKeyRenamedTo absent from result + fragment:split log entry
→ but the write renames the file, the Margin, and rewrites links to the new casing
```

The action log misses a rename that rewrote referring bodies across the vault. The same lowercase comparison pre-exists in `resolveOriginalPieceKey` (`split-piece-keys.ts:35`), so the automatic heading-rename path has the same latent hole — the new code replicated it rather than introduced it.

Fix: compare case-sensitively in both places (matching the storage layer's definition of a rename), or normalize deliberately and document that case-only edits are ignored.

---

## Design

None.

---

## Minor

### 2. Misleading conflict error when a later piece claims the freed key

`split-fragment.ts:192` — with a piece-1 rename, the original's old key is reserved, so a pieces-2…N *override* equal to it rejects with `A fragment with the key "X" already exists` — while the user is looking at a dialog in which they just renamed piece 1 away from X. The reservation itself is necessary (pieces are written before the rename lands, so a new fragment with the live key would trip the storage `KEY_CONFLICT` or clobber), and the in-modal validation can't catch it (it doesn't know existing keys). Key-swapping between piece 1 and a later piece is therefore impossible in one split. Worth a more specific error message ("that key is still held by the original until the split completes") if it ever bites.

### 3. Spec constraint on prose loss doesn't mention the override exception

`specifications/fragment-split.md:87` — the Constraints section says every stripped heading "is relocated into its piece's key rather than dropped", with the symbol-only heading as the sole exception. A key override on a heading-stripped piece (now including piece 1) is a second exception: the heading is stripped and the key is the user's choice, so the heading text lands nowhere (confirmed by the "override wins" test: body `Body one`, heading text gone). Deliberate — the user sees the preview — but the constraint's wording is now out of sync.

### 4. Annotation can claim a rename that won't happen

`SplitFragmentDialog.tsx:425` — with heading-stripping active (`renamedOriginal: true`), the preview shows the *new* heading-derived key. If the user edits piece 1's key back to the original's actual current key, the server treats it as a no-op (no rename), but the annotation still reads "(original, renamed)" because `renamedOriginal` short-circuits the check. The dialog never knows the pre-rename key, so it can't detect this. Edge case (requires the user to retype the old key from memory); cosmetic.

---

## Non-issues

- **An override is sent even when the user reverts an edit to the preview's exact value** — `editedKeys` retains the entry, but the server resolves it to the identical outcome (same key; own-key resubmission is a no-op), so no behavior difference.
- **`overrideKeyByPieceIndex` no longer filters `pieceIndex >= 2` and accepts out-of-range indexes** — the schema enforces `int().min(1)`, and indexes beyond the piece count are simply never read; same silent-ignore behavior as before the change.
- **Reserving the original's old key so unsuffixed derived keys can't take it** (`split-fragment.ts:192`) — looks over-cautious but is load-bearing: Phase B writes pieces 2…N while the original still holds its old key, so a piece claiming it would conflict or clobber mid-split. The test "suffixes a later piece reusing the old key…" pins this.
- **Dialog key validation now includes piece 1** (`keyError` loop) — intentional; piece 1 is editable so it needs the same empty/malformed/duplicate feedback.
- **`resolveOverrideKey` rejects collisions where `deriveKey` would suffix** — intentional asymmetry: an explicit user choice colliding is an error (`SPLIT_KEY_CONFLICT`); only derived keys auto-suffix. Matches the 2026-06-19 shipped behavior.

---

## Resolution

Fixed 2026-07-16 (commit follows this note).

1. **Case-only rename reported as "no rename"** — the `renamed` determination now compares **case-sensitively** in both places: `split-fragment.ts` (piece-1 override branch, `key !== original.key`) and `resolveOriginalPieceKey` in `split-piece-keys.ts` (`key !== originalKey`), matching the storage layer's `oldKey !== fragmentToWrite.key`. The collision sets (`otherKeys`, `existingKeys`) stay lowercased — only the rename flag changed. A case-only piece-1 override (or heading-strip rename) now surfaces `originalKeyRenamedTo` on the result and the `fragment:split` log entry. Two new API tests cover the override path and the automatic heading path.

2. **Misleading conflict error** — the original's still-reserved old key is now tracked separately (`reservedOriginalKey`, set only when the original was actually renamed) and passed to `resolveOverrideKey`. A later-piece override equal to it now rejects with a specific message ("…still held by the original fragment until this split completes… key-swapping between pieces is not possible in one split"), still as `SplitKeyConflictError` / 400 `SPLIT_KEY_CONFLICT`. The old key stays in `otherKeys` too, so derived-key suffixing is unchanged. New API test asserts the message.

3. **Spec wording** — the Constraints "prose loss" bullet in `specifications/fragment-split.md` now names the user-key-override on a heading-stripped piece as a second deliberate exception (heading stripped, key is the user's choice, heading text lands nowhere), alongside the symbol-only-heading exception.

4. **Annotation claiming a rename that won't happen** — the `split-preview` command/schema now returns the original's current key (`originalKey`), regenerated into the OpenAPI snapshot + orval client. The dialog stores it and computes the piece-1 annotation from `effectiveKey(piece) !== originalKey` (case-sensitive, matching the server), so editing piece 1 back to the original's exact current key reads "(original)". New frontend test covers this.

Tests: `packages/api` split-fragment suite 39 pass (was 36), preview-split 9 pass; `packages/frontend` SplitFragmentDialog 19 pass (was 18). `bun run verify:openapi` clean; frontend typecheck clean. The only `verify` failure is the pre-existing CORS typecheck error in `packages/api/src/app.ts` (documented in commit cc5f3f82), unrelated to these changes.

---
