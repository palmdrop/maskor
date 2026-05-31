import { describe, it, expect } from "bun:test";
import { assembleSequence, assemblePieces } from "../assemble";
import type { AssemblySeparator } from "../assemble-markdown";
import { ANCHOR_SENTINEL_PATTERN, anchorSentinel } from "@maskor/shared/sentinel";
import type { Fragment } from "@maskor/shared";

const makeFragment = (overrides: Partial<Fragment> & { uuid: string; key: string }): Fragment => ({
  content: `Content of ${overrides.key}`,
  readiness: 1,
  contentHash: "",
  updatedAt: new Date(),
  notes: [],
  references: [],
  isDiscarded: false,
  aspects: {},
  ...overrides,
});

const sectionUuid = "section-1";
const mainSequenceBase = {
  uuid: "seq-1",
  name: "Main",
  isMain: true,
};

const baseOptions = {
  separator: "blank-line" as const,
  showTitles: true,
  showSectionHeadings: true,
  includeAnchors: false,
};

describe("assembleSequence — nav payload", () => {
  it("returns empty markdown and one empty section for an empty sequence", () => {
    const result = assembleSequence(
      { ...mainSequenceBase, sections: [{ uuid: sectionUuid, name: "Chapter 1", fragments: [] }] },
      [],
      baseOptions,
    );
    // Only the section heading is emitted; no fragments.
    expect(result.markdown).toBe("## Chapter 1");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.fragments).toHaveLength(0);
  });

  it("builds lean nav (uuid + key, no content) from placed fragments", () => {
    const fragment = makeFragment({ uuid: "frag-1", key: "opening" });
    const result = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Intro",
            fragments: [{ uuid: "pos-1", fragmentUuid: "frag-1", position: 0 }],
          },
        ],
      },
      [fragment],
      baseOptions,
    );
    expect(result.sections[0]!.fragments).toEqual([{ uuid: "frag-1", key: "opening" }]);
  });

  it("orders fragments by position within a section", () => {
    const fragments = [
      makeFragment({ uuid: "frag-a", key: "alpha" }),
      makeFragment({ uuid: "frag-b", key: "beta" }),
      makeFragment({ uuid: "frag-c", key: "gamma" }),
    ];
    const result = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Body",
            fragments: [
              { uuid: "pos-c", fragmentUuid: "frag-c", position: 2 },
              { uuid: "pos-a", fragmentUuid: "frag-a", position: 0 },
              { uuid: "pos-b", fragmentUuid: "frag-b", position: 1 },
            ],
          },
        ],
      },
      fragments,
      baseOptions,
    );
    expect(result.sections[0]!.fragments.map((f) => f.key)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("skips missing fragments with a warning", () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnMessages.push(msg);

    try {
      const result = assembleSequence(
        {
          ...mainSequenceBase,
          sections: [
            {
              uuid: sectionUuid,
              name: "Drifted",
              fragments: [{ uuid: "pos-missing", fragmentUuid: "ghost-uuid", position: 0 }],
            },
          ],
        },
        [],
        baseOptions,
      );
      expect(result.sections[0]!.fragments).toHaveLength(0);
      expect(warnMessages.some((m) => m.includes("ghost-uuid"))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("skips discarded fragments", () => {
    const fragments = [
      makeFragment({ uuid: "frag-live", key: "live" }),
      makeFragment({ uuid: "frag-dead", key: "dead", isDiscarded: true }),
    ];
    const result = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Mixed",
            fragments: [
              { uuid: "pos-live", fragmentUuid: "frag-live", position: 0 },
              { uuid: "pos-dead", fragmentUuid: "frag-dead", position: 1 },
            ],
          },
        ],
      },
      fragments,
      baseOptions,
    );
    expect(result.sections[0]!.fragments.map((f) => f.key)).toEqual(["live"]);
    expect(result.markdown).not.toContain("Content of dead");
  });
});

describe("assembleSequence — markdown assembly", () => {
  const twoFragmentSection = (overrides?: { separator?: AssemblySeparator }) =>
    assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Part One",
            fragments: [
              { uuid: "pos-1", fragmentUuid: "frag-1", position: 0 },
              { uuid: "pos-2", fragmentUuid: "frag-2", position: 1 },
            ],
          },
        ],
      },
      [
        makeFragment({ uuid: "frag-1", key: "first", content: "Body one." }),
        makeFragment({ uuid: "frag-2", key: "second", content: "Body two." }),
      ],
      { ...baseOptions, ...overrides },
    ).markdown;

  it("emits section name as ## and titles as ###", () => {
    const markdown = twoFragmentSection();
    expect(markdown).toContain("## Part One");
    expect(markdown).toContain("### first");
    expect(markdown).toContain("### second");
  });

  it("inserts a horizontal-rule separator between fragments but not trailing", () => {
    const markdown = twoFragmentSection({ separator: "horizontal-rule" });
    expect(markdown).toBe(
      "## Part One\n\n### first\n\nBody one.\n\n---\n\n### second\n\nBody two.",
    );
    // One separator only — between the two fragments.
    expect(markdown.match(/---/g)).toHaveLength(1);
  });

  it("blank-line separator yields an extra whitespace paragraph between fragments", () => {
    const markdown = twoFragmentSection({ separator: "blank-line" });
    expect(markdown).toBe(
      "## Part One\n\n### first\n\nBody one.\n\n\u00A0\n\n### second\n\nBody two.",
    );
  });

  it("none separator yields no extra segment between fragments", () => {
    const markdown = twoFragmentSection({ separator: "none" });
    expect(markdown).toBe("## Part One\n\n### first\n\nBody one.\n\n### second\n\nBody two.");
  });

  it("hides titles when showTitles is false but keeps fragment separators", () => {
    const markdown = twoFragmentSection({ separator: "horizontal-rule" });
    const noTitles = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Part One",
            fragments: [
              { uuid: "pos-1", fragmentUuid: "frag-1", position: 0 },
              { uuid: "pos-2", fragmentUuid: "frag-2", position: 1 },
            ],
          },
        ],
      },
      [
        makeFragment({ uuid: "frag-1", key: "first", content: "Body one." }),
        makeFragment({ uuid: "frag-2", key: "second", content: "Body two." }),
      ],
      { ...baseOptions, showTitles: false, separator: "horizontal-rule" },
    ).markdown;
    expect(markdown).toContain("### first");
    expect(noTitles).not.toContain("### first");
    expect(noTitles).toBe("## Part One\n\nBody one.\n\n---\n\nBody two.");
  });

  it("hides section headings when showSectionHeadings is false", () => {
    const markdown = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Hidden",
            fragments: [{ uuid: "pos-1", fragmentUuid: "frag-1", position: 0 }],
          },
        ],
      },
      [makeFragment({ uuid: "frag-1", key: "only", content: "Body." })],
      { ...baseOptions, showSectionHeadings: false },
    ).markdown;
    expect(markdown).not.toContain("Hidden");
    expect(markdown).toBe("### only\n\nBody.");
  });

  it("does not insert a fragment separator across a section boundary", () => {
    const markdown = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: "sec-a",
            name: "Part One",
            fragments: [{ uuid: "pos-1", fragmentUuid: "frag-1", position: 0 }],
          },
          {
            uuid: "sec-b",
            name: "Part Two",
            fragments: [{ uuid: "pos-2", fragmentUuid: "frag-2", position: 0 }],
          },
        ],
      },
      [
        makeFragment({ uuid: "frag-1", key: "first", content: "Body one." }),
        makeFragment({ uuid: "frag-2", key: "second", content: "Body two." }),
      ],
      { ...baseOptions, showTitles: false, separator: "horizontal-rule" },
    ).markdown;
    // The only structural break between the two bodies is the section heading.
    expect(markdown).toBe("## Part One\n\nBody one.\n\n## Part Two\n\nBody two.");
    expect(markdown).not.toContain("---");
  });

  it("emits fragment-internal headings verbatim (no shifting)", () => {
    const markdown = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Sec",
            fragments: [{ uuid: "pos-1", fragmentUuid: "frag-1", position: 0 }],
          },
        ],
      },
      [makeFragment({ uuid: "frag-1", key: "k", content: "# Internal H1\n\nText." })],
      { ...baseOptions, showTitles: false },
    ).markdown;
    expect(markdown).toContain("# Internal H1");
  });
});

describe("assembleSequence — anchors", () => {
  const single = (includeAnchors: boolean) =>
    assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Sec",
            fragments: [{ uuid: "pos-1", fragmentUuid: "frag-1", position: 0 }],
          },
        ],
      },
      [makeFragment({ uuid: "frag-1", key: "k", content: "Body." })],
      { ...baseOptions, includeAnchors },
    ).markdown;

  it("omits sentinels when includeAnchors is false", () => {
    expect(single(false)).not.toMatch(ANCHOR_SENTINEL_PATTERN);
  });

  it("emits a sentinel encoding the fragment uuid when includeAnchors is true", () => {
    const markdown = single(true);
    expect(markdown).toContain(anchorSentinel("frag-1"));
    const match = markdown.match(ANCHOR_SENTINEL_PATTERN);
    expect(match?.[1]).toBe("frag-1");
  });

  it("emits the anchor before the title when titles are shown (so nav lands on the heading)", () => {
    const markdown = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Sec",
            fragments: [{ uuid: "pos-1", fragmentUuid: "frag-1", position: 0 }],
          },
        ],
      },
      [makeFragment({ uuid: "frag-1", key: "k", content: "Body." })],
      { ...baseOptions, showTitles: true, includeAnchors: true },
    ).markdown;
    // Order: section heading → anchor → title → body. The anchor precedes the ###.
    expect(markdown).toBe(`## Sec\n\n${anchorSentinel("frag-1")}\n\n### k\n\nBody.`);
  });

  it("emits the anchor before the body when titles are hidden (body leads the unit)", () => {
    const markdown = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Sec",
            fragments: [{ uuid: "pos-1", fragmentUuid: "frag-1", position: 0 }],
          },
        ],
      },
      [makeFragment({ uuid: "frag-1", key: "k", content: "Body." })],
      { ...baseOptions, showTitles: false, includeAnchors: true },
    ).markdown;
    expect(markdown).toBe(`## Sec\n\n${anchorSentinel("frag-1")}\n\nBody.`);
  });

  it("strips sentinel-resembling control characters from body content (collision safety)", () => {
    const forged = `Real text ${anchorSentinel("evil")} more text`;
    const markdown = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Sec",
            fragments: [{ uuid: "pos-1", fragmentUuid: "frag-1", position: 0 }],
          },
        ],
      },
      [makeFragment({ uuid: "frag-1", key: "k", content: forged })],
      { ...baseOptions, includeAnchors: true },
    ).markdown;

    // Exactly one sentinel survives — the real one for frag-1. The forged token's
    // control characters were stripped, so it cannot match the pattern and cannot
    // forge an anchor (the leftover label text is inert).
    const all = [...markdown.matchAll(new RegExp(ANCHOR_SENTINEL_PATTERN, "g"))];
    expect(all).toHaveLength(1);
    expect(all[0]![1]).toBe("frag-1");
    // The surrounding visible text is preserved.
    expect(markdown).toContain("Real text");
    expect(markdown).toContain("more text");
  });
});

describe("assemblePieces", () => {
  const pieces = [
    { pieceIndex: 1, derivedKey: "intro", content: "First piece." },
    { pieceIndex: 2, derivedKey: "body", content: "Second piece." },
  ];

  it("assembles pieces into one unnamed section with per-piece anchors", () => {
    const result = assemblePieces(pieces);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.name).toBe("");
    expect(result.sections[0]!.fragments).toEqual([
      { uuid: "1", key: "intro" },
      { uuid: "2", key: "body" },
    ]);
  });

  it("titles each piece '<index>. <key>', anchors on, horizontal-rule separated", () => {
    const result = assemblePieces(pieces);
    expect(result.markdown).toContain("### 1. intro");
    expect(result.markdown).toContain("### 2. body");
    expect(result.markdown).toContain("---");
    expect(result.markdown).toContain(anchorSentinel("1"));
    expect(result.markdown).toContain(anchorSentinel("2"));
  });

  it("places each piece's anchor before its title (titles always shown in import preview)", () => {
    const result = assemblePieces(pieces);
    // Each anchor immediately precedes its own ### heading.
    expect(result.markdown).toContain(`${anchorSentinel("1")}\n\n### 1. intro`);
    expect(result.markdown).toContain(`${anchorSentinel("2")}\n\n### 2. body`);
  });

  it("returns empty markdown and an empty section for no pieces", () => {
    const result = assemblePieces([]);
    expect(result.markdown).toBe("");
    expect(result.sections).toEqual([{ uuid: "", name: "", fragments: [] }]);
  });
});
