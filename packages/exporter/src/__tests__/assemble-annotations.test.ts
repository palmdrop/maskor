import { describe, it, expect } from "bun:test";
import { assembleSequence, assembleSequenceForExport, type SequenceAnnotations } from "../assemble";
import type { AssemblySeparator } from "../assemble-markdown";
import type { Fragment } from "@maskor/shared";

const makeFragment = (overrides: Partial<Fragment> & { uuid: string; key: string }): Fragment => ({
  content: `Content of ${overrides.key}`,
  readiness: 1,
  contentHash: "",
  createdAt: new Date(),
  updatedAt: new Date(),
  references: [],
  isDiscarded: false,
  aspects: {},
  ...overrides,
});

const mainSequenceBase = { uuid: "seq-1", name: "Main", isMain: true };

const baseOptions = {
  separator: "blank-line" as AssemblySeparator,
  showTitles: true,
  showSectionHeadings: true,
  includeAnchors: false,
};

// One section, fragments in the order given. `positions` map fragment uuid → position.
const singleSection = (fragments: Fragment[]) => ({
  ...mainSequenceBase,
  sections: [
    {
      uuid: "section-1",
      name: "Chapter",
      fragments: fragments.map((fragment, index) => ({
        uuid: `pos-${index}`,
        fragmentUuid: fragment.uuid,
        position: index,
      })),
    },
  ],
});

describe("assembleSequenceForExport — byte-identity when annotations off", () => {
  it("matches assembleSequence output for the same options, markers stripped", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "first", content: "Body one. <!--c:m1-->" }),
      makeFragment({ uuid: "frag-2", key: "second", content: "Body two." }),
    ];
    const options = { ...baseOptions, separator: "horizontal-rule" as const };
    const plain = assembleSequence(singleSection(fragments), fragments, options);

    // Even with annotation data present, both toggles off must reproduce the
    // plain assembly byte-for-byte (preview depends on this).
    const exported = assembleSequenceForExport(singleSection(fragments), fragments, options, {
      includeReferences: false,
      includeMarginAnnotations: false,
      byFragmentUuid: {
        "frag-1": {
          notes: "Ignored note",
          comments: [{ markerId: "m1", body: "Ignored comment" }],
          references: [{ key: "ignored", body: "Ignored ref" }],
        },
      },
    });

    expect(exported.markdown).toBe(plain.markdown);
    expect(exported.docxMarkdown).toBe(plain.markdown);
    expect(exported.warnings).toEqual([]);
    expect(exported.commentBodies).toEqual({});
    expect(exported.sections).toEqual(plain.sections);
  });
});

describe("assembleSequenceForExport — Margin comments as footnotes", () => {
  it("replaces a bound marker with a sequential footnote ref and emits the bare body", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "k", content: "The bridge groans. <!--c:m1-->" }),
    ];
    const result = assembleSequenceForExport(singleSection(fragments), fragments, baseOptions, {
      includeReferences: false,
      includeMarginAnnotations: true,
      byFragmentUuid: {
        "frag-1": {
          notes: "",
          comments: [{ markerId: "m1", body: "Heavy imagery." }],
          references: [],
        },
      },
    });
    expect(result.markdown).toBe(
      "## Chapter\n\n### k\n\nThe bridge groans.[^c1]\n\n[^c1]: Heavy imagery.",
    );
    expect(result.warnings).toEqual([]);
  });

  it("strips an inert marker (no matching comment) with no footnote", () => {
    const fragments = [makeFragment({ uuid: "frag-1", key: "k", content: "Line. <!--c:ghost-->" })];
    const result = assembleSequenceForExport(singleSection(fragments), fragments, baseOptions, {
      includeReferences: false,
      includeMarginAnnotations: true,
      byFragmentUuid: {
        "frag-1": { notes: "", comments: [], references: [] },
      },
    });
    expect(result.markdown).toBe("## Chapter\n\n### k\n\nLine.");
  });

  it("skips an orphaned comment and warns with { fragmentKey, count }", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "opening", content: "No marker here." }),
    ];
    const result = assembleSequenceForExport(singleSection(fragments), fragments, baseOptions, {
      includeReferences: false,
      includeMarginAnnotations: true,
      byFragmentUuid: {
        "frag-1": {
          notes: "",
          comments: [
            { markerId: "missing-1", body: "Orphan one" },
            { markerId: "missing-2", body: "Orphan two" },
          ],
          references: [],
        },
      },
    });
    expect(result.markdown).toBe("## Chapter\n\n### opening\n\nNo marker here.");
    expect(result.warnings).toEqual([{ fragmentKey: "opening", count: 2 }]);
  });
});

describe("assembleSequenceForExport — Margin notes placement + shared counter", () => {
  it("appends the notes ref to the title line when titles are shown, before body comments", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "title-key", content: "Prose. <!--c:m1-->" }),
    ];
    const result = assembleSequenceForExport(singleSection(fragments), fragments, baseOptions, {
      includeReferences: false,
      includeMarginAnnotations: true,
      byFragmentUuid: {
        "frag-1": {
          notes: "A whole-fragment note.",
          comments: [{ markerId: "m1", body: "Inline comment." }],
          references: [],
        },
      },
    });
    // Notes ref c1 rides the title; the comment ref c2 follows in the body.
    expect(result.markdown).toBe(
      "## Chapter\n\n### title-key[^c1]\n\nProse.[^c2]\n\n[^c1]: A whole-fragment note.\n\n[^c2]: Inline comment.",
    );
  });

  it("appends the notes ref to the first line of the body when titles are off", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "k", content: "First line.\nSecond line." }),
    ];
    const result = assembleSequenceForExport(
      singleSection(fragments),
      fragments,
      { ...baseOptions, showTitles: false },
      {
        includeReferences: false,
        includeMarginAnnotations: true,
        byFragmentUuid: {
          "frag-1": { notes: "Head note.", comments: [], references: [] },
        },
      },
    );
    expect(result.markdown).toBe(
      "## Chapter\n\nFirst line.[^c1]\nSecond line.\n\n[^c1]: Head note.",
    );
  });

  it("shares one counter across fragments in document order", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "a", content: "Alpha. <!--c:m1-->" }),
      makeFragment({ uuid: "frag-2", key: "b", content: "Beta. <!--c:m2-->" }),
    ];
    const result = assembleSequenceForExport(
      singleSection(fragments),
      fragments,
      { ...baseOptions, separator: "none" },
      {
        includeReferences: false,
        includeMarginAnnotations: true,
        byFragmentUuid: {
          "frag-1": {
            notes: "Note A.",
            comments: [{ markerId: "m1", body: "Comment A." }],
            references: [],
          },
          "frag-2": {
            notes: "",
            comments: [{ markerId: "m2", body: "Comment B." }],
            references: [],
          },
        },
      },
    );
    // frag-1 notes → c1, frag-1 comment → c2, frag-2 comment → c3.
    expect(result.markdown).toBe(
      "## Chapter\n\n### a[^c1]\n\nAlpha.[^c2]\n\n### b\n\nBeta.[^c3]\n\n" +
        "[^c1]: Note A.\n\n[^c2]: Comment A.\n\n[^c3]: Comment B.",
    );
  });
});

describe("assembleSequenceForExport — References as footnotes", () => {
  const withReferences = (
    fragments: Fragment[],
    annotations: SequenceAnnotations,
    options = baseOptions,
  ) => assembleSequenceForExport(singleSection(fragments), fragments, options, annotations);

  it("appends a reference footnote to the body's last line, label = slugified key", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "k", content: "First line.\nLast line." }),
    ];
    const result = withReferences(fragments, {
      includeReferences: true,
      includeMarginAnnotations: false,
      byFragmentUuid: {
        "frag-1": {
          notes: "",
          comments: [],
          references: [{ key: "Mrs Dalloway", body: "Woolf, 1925." }],
        },
      },
    });
    expect(result.markdown).toBe(
      "## Chapter\n\n### k\n\nFirst line.\nLast line.[^mrs-dalloway]\n\n[^mrs-dalloway]: Mrs Dalloway — Woolf, 1925.",
    );
  });

  it("degrades an empty reference body to the key alone", () => {
    const fragments = [makeFragment({ uuid: "frag-1", key: "k", content: "Body." })];
    const result = withReferences(fragments, {
      includeReferences: true,
      includeMarginAnnotations: false,
      byFragmentUuid: {
        "frag-1": { notes: "", comments: [], references: [{ key: "Bare Key", body: "   " }] },
      },
    });
    expect(result.markdown).toBe(
      "## Chapter\n\n### k\n\nBody.[^bare-key]\n\n[^bare-key]: Bare Key",
    );
  });

  it("dedupes a reference attached to multiple fragments: one definition, many refs", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "a", content: "Alpha." }),
      makeFragment({ uuid: "frag-2", key: "b", content: "Beta." }),
    ];
    const shared = { key: "Ulysses", body: "Joyce." };
    const result = withReferences(
      fragments,
      {
        includeReferences: true,
        includeMarginAnnotations: false,
        byFragmentUuid: {
          "frag-1": { notes: "", comments: [], references: [shared] },
          "frag-2": { notes: "", comments: [], references: [shared] },
        },
      },
      { ...baseOptions, separator: "none" },
    );
    // Both bodies point at [^ulysses]; a single definition at the end.
    expect(result.markdown).toBe(
      "## Chapter\n\n### a\n\nAlpha.[^ulysses]\n\n### b\n\nBeta.[^ulysses]\n\n[^ulysses]: Ulysses — Joyce.",
    );
    expect(result.markdown.match(/\[\^ulysses\]:/g)).toHaveLength(1);
  });

  it("suffixes colliding slugs of different keys deterministically", () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "a", content: "Alpha." }),
      makeFragment({ uuid: "frag-2", key: "b", content: "Beta." }),
    ];
    const result = withReferences(
      fragments,
      {
        includeReferences: true,
        includeMarginAnnotations: false,
        byFragmentUuid: {
          "frag-1": { notes: "", comments: [], references: [{ key: "The Bridge", body: "One" }] },
          "frag-2": { notes: "", comments: [], references: [{ key: "the bridge!", body: "Two" }] },
        },
      },
      { ...baseOptions, separator: "none" },
    );
    // Both keys slugify to "the-bridge"; the second gets "-2".
    expect(result.markdown).toContain("Alpha.[^the-bridge]");
    expect(result.markdown).toContain("Beta.[^the-bridge-2]");
    expect(result.markdown).toContain("[^the-bridge]: The Bridge — One");
    expect(result.markdown).toContain("[^the-bridge-2]: the bridge! — Two");
  });

  it("emits definitions in first-reference order (notes, comment, reference within a fragment)", () => {
    const fragments = [makeFragment({ uuid: "frag-1", key: "k", content: "Prose. <!--c:m1-->" })];
    const result = assembleSequenceForExport(singleSection(fragments), fragments, baseOptions, {
      includeReferences: true,
      includeMarginAnnotations: true,
      byFragmentUuid: {
        "frag-1": {
          notes: "Note.",
          comments: [{ markerId: "m1", body: "Comment." }],
          references: [{ key: "Source", body: "Cited." }],
        },
      },
    });
    const definitionsStart = result.markdown.indexOf("[^c1]:");
    const definitionsTail = result.markdown.slice(definitionsStart);
    expect(definitionsTail).toBe("[^c1]: Note.\n\n[^c2]: Comment.\n\n[^source]: Source — Cited.");
  });
});
