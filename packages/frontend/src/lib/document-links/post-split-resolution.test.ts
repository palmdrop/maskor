import { describe, it, expect } from "vitest";
import { toFragmentLookup } from "./useDocumentLinks";
import { findLinkRanges, type LinkLookups, EMPTY_LINK_LOOKUPS } from "./resolver";

// Regression for the reported bug: "I split a document, added a document link, but that link pointed
// to the *next* fragment in the sequence, not the one I picked." (`references/TODO.md`).
//
// Root cause (see the plan's Phase 1 report): a document link is stored canonically as
// `[[fragments/key]]` and resolved to a uuid *at navigate time* against the live `useListFragments`
// snapshot (`toFragmentLookup`). The failure mode is a snapshot in which one key maps to two
// fragments — resolution then has to pick one, and picking the wrong one navigates to a sibling. These
// tests pin the two conditions that keep that from happening: (1) resolution is deterministic and
// prefers the *active* fragment, and (2) a link key always resolves to the fragment carrying that
// exact key even when a sibling piece from the same split sits next to it in the list.
describe("post-split document-link resolution", () => {
  const lookupsWith = (fragments: Parameters<typeof toFragmentLookup>[0]): LinkLookups => ({
    ...EMPTY_LINK_LOOKUPS,
    fragments: toFragmentLookup(fragments),
  });

  const resolveUuid = (body: string, lookups: LinkLookups): string | null =>
    findLinkRanges(body, lookups)[0]!.resolved.uuid;

  it("resolves a link to the split piece that carries the key, not its sibling", () => {
    // A split of `river` produced a truncated original (key `river`, U1) and a new piece whose derived
    // key was suffixed to avoid the collision (`river-1`, U2) — the split guarantees distinct keys.
    const lookups = lookupsWith([
      { key: "river", uuid: "U1", isDiscarded: false },
      { key: "river-1", uuid: "U2", isDiscarded: false },
    ]);
    // The picked piece (`river-1`) must resolve to its own uuid, never the adjacent `river`.
    expect(resolveUuid("see [[fragments/river-1]]", lookups)).toBe("U2");
    expect(resolveUuid("see [[fragments/river]]", lookups)).toBe("U1");
  });

  it("resolves to the active fragment when a discarded one reused the key", () => {
    // `readAll` (the source for `useListFragments`) includes discarded fragments, and a split's key
    // derivation ignores discarded keys — so a new active piece can carry the same key as a discarded
    // fragment. A link to that key must open the live piece, never the discarded copy.
    const lookups = lookupsWith([
      { key: "harbour", uuid: "discarded", isDiscarded: true },
      { key: "harbour", uuid: "active", isDiscarded: false },
    ]);
    expect(resolveUuid("see [[fragments/harbour]]", lookups)).toBe("active");
  });

  it("resolves the active piece regardless of the order the split list arrives in", () => {
    // React Query may deliver the post-split list in either order while a refetch settles; resolution
    // must not depend on which fragment happens to come last (the "next in the list" misroute).
    const activeFirst = lookupsWith([
      { key: "harbour", uuid: "active", isDiscarded: false },
      { key: "harbour", uuid: "discarded", isDiscarded: true },
    ]);
    const discardedFirst = lookupsWith([
      { key: "harbour", uuid: "discarded", isDiscarded: true },
      { key: "harbour", uuid: "active", isDiscarded: false },
    ]);
    expect(resolveUuid("[[fragments/harbour]]", activeFirst)).toBe("active");
    expect(resolveUuid("[[fragments/harbour]]", discardedFirst)).toBe("active");
  });
});
