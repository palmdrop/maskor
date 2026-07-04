// A small, synchronous fingerprint of editor content, used as the swap file's "baseline": the server
// content the buffered edits diverged from. Recovery compares the stored baseline against the current
// server content to tell a single-tab crash (baseline still matches) from a stale multi-tab overwrite
// (the server advanced elsewhere). See references/plans/multi-tab-swap-hardening.md.
//
// This is NOT a security hash — it only needs to change when the content changes. A collision would at
// worst make a conflicting backup look non-conflicting (degrading to today's auto-apply behaviour),
// which is acceptable for a transient crash net. `crypto.subtle` is async and overkill here.
//
// Normalized with trimEnd so it agrees with `isTrailingWhitespaceEquivalent` — the server re-normalizes
// trailing whitespace on save (body.trim()), so a trailing-newline-only difference must not read as a
// changed baseline.
export const hashContent = (value: string): string => {
  const normalized = value.trimEnd();
  // cyrb53 — a fast, well-distributed 53-bit string hash.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ charCode, 2654435761);
    h2 = Math.imul(h2 ^ charCode, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashNumber = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hashNumber.toString(16);
};
