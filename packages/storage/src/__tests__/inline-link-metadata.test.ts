import { describe, it, expect } from "bun:test";
import type { Fragment } from "@maskor/shared";
import { applyInlineLinkMetadata } from "../vault/markdown/inline-link-metadata";

const makeFragment = (overrides: Partial<Fragment>): Fragment => ({
  uuid: "11111111-1111-1111-1111-111111111111",
  key: "frag",
  isDiscarded: false,
  readiness: 0,
  references: [],
  aspects: {},
  content: "",
  contentHash: "",
  updatedAt: new Date("2026-06-16T00:00:00.000Z"),
  ...overrides,
});

describe("applyInlineLinkMetadata", () => {
  it("adds an inline-linked reference to the reference list", () => {
    const result = applyInlineLinkMetadata(
      makeFragment({ content: "see [[references/source-x]]" }),
      true,
    );
    expect(result.references).toEqual(["source-x"]);
  });

  it("adds an inline-linked aspect at weight 0", () => {
    const result = applyInlineLinkMetadata(makeFragment({ content: "[[aspects/mood]]" }), true);
    expect(result.aspects).toEqual({ mood: { weight: 0 } });
  });

  it("preserves an existing non-zero aspect weight when re-linked", () => {
    const result = applyInlineLinkMetadata(
      makeFragment({ content: "[[aspects/mood]]", aspects: { mood: { weight: 0.7 } } }),
      true,
    );
    expect(result.aspects).toEqual({ mood: { weight: 0.7 } });
  });

  it("does not add a note link to any metadata list", () => {
    const result = applyInlineLinkMetadata(makeFragment({ content: "[[notes/thoughts]]" }), true);
    expect(result.references).toEqual([]);
    expect(result.aspects).toEqual({});
  });

  it("reaps a weight-0 aspect with no inline link when reaping is enabled", () => {
    const result = applyInlineLinkMetadata(
      makeFragment({ content: "no links", aspects: { mood: { weight: 0 } } }),
      true,
    );
    expect(result.aspects).toEqual({});
  });

  it("keeps a weight>0 aspect even without an inline link", () => {
    const result = applyInlineLinkMetadata(
      makeFragment({ content: "no links", aspects: { mood: { weight: 0.4 } } }),
      true,
    );
    expect(result.aspects).toEqual({ mood: { weight: 0.4 } });
  });

  it("does not reap when reaping is disabled (metadata-only save)", () => {
    const result = applyInlineLinkMetadata(
      makeFragment({ content: "no links", aspects: { mood: { weight: 0 } } }),
      false,
    );
    expect(result.aspects).toEqual({ mood: { weight: 0 } });
  });

  it("never auto-removes references", () => {
    const result = applyInlineLinkMetadata(
      makeFragment({ content: "no links", references: ["kept"] }),
      true,
    );
    expect(result.references).toEqual(["kept"]);
  });

  it("is idempotent", () => {
    const fragment = makeFragment({
      content: "[[references/a]] [[aspects/b]]",
      references: ["a"],
      aspects: { b: { weight: 0 } },
    });
    const once = applyInlineLinkMetadata(fragment, true);
    const twice = applyInlineLinkMetadata(once, true);
    expect(twice).toEqual(once);
  });
});
