import { describe, it, expect, beforeEach } from "bun:test";
import { assembleSequence } from "../assemble";
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

describe("assembleSequence", () => {
  it("returns empty sections for an empty sequence", () => {
    const result = assembleSequence(
      { ...mainSequenceBase, sections: [{ uuid: sectionUuid, name: "Chapter 1", fragments: [] }] },
      [],
    );
    expect(result.sequenceUuid).toBe("seq-1");
    expect(result.sequenceName).toBe("Main");
    expect(result.isMain).toBe(true);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.fragments).toHaveLength(0);
  });

  it("assembles a single section with a single fragment", () => {
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
    );
    expect(result.sections[0]!.fragments).toHaveLength(1);
    expect(result.sections[0]!.fragments[0]!.uuid).toBe("frag-1");
    expect(result.sections[0]!.fragments[0]!.key).toBe("opening");
    expect(result.sections[0]!.fragments[0]!.content).toBe("Content of opening");
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
    );
    const keys = result.sections[0]!.fragments.map((f) => f.key);
    expect(keys).toEqual(["alpha", "beta", "gamma"]);
  });

  it("tolerates position gaps without error", () => {
    const fragments = [
      makeFragment({ uuid: "frag-x", key: "first" }),
      makeFragment({ uuid: "frag-y", key: "third" }),
    ];
    const result = assembleSequence(
      {
        ...mainSequenceBase,
        sections: [
          {
            uuid: sectionUuid,
            name: "Gapped",
            fragments: [
              { uuid: "pos-x", fragmentUuid: "frag-x", position: 0 },
              { uuid: "pos-y", fragmentUuid: "frag-y", position: 5 },
            ],
          },
        ],
      },
      fragments,
    );
    expect(result.sections[0]!.fragments).toHaveLength(2);
    expect(result.sections[0]!.fragments[0]!.key).toBe("first");
    expect(result.sections[0]!.fragments[1]!.key).toBe("third");
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
    );
    expect(result.sections[0]!.fragments).toHaveLength(1);
    expect(result.sections[0]!.fragments[0]!.key).toBe("live");
  });

  it("assembles multi-section sequences preserving section order", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "intro" }),
      makeFragment({ uuid: "frag-2", key: "body" }),
    ];
    const result = assembleSequence(
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
      fragments,
    );
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]!.name).toBe("Part One");
    expect(result.sections[0]!.fragments[0]!.key).toBe("intro");
    expect(result.sections[1]!.name).toBe("Part Two");
    expect(result.sections[1]!.fragments[0]!.key).toBe("body");
  });
});
