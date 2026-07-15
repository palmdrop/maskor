import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { Fragment, Sequence } from "@maskor/shared";
import type { CommandContext } from "../../commands/types";
import { executeCommand } from "../../commands/types";
import {
  splitFragmentCommand,
  SplitNoOpError,
  SplitKeyConflictError,
  SplitKeyInvalidError,
  SplitSequenceNameInvalidError,
} from "../../commands/fragments/split-fragment";
import type { Logger } from "@maskor/shared/logger";

const makeLogger = (): Logger => {
  const noOp = () => {};
  return {
    info: noOp,
    warn: noOp,
    debug: noOp,
    error: noOp,
    child: () => makeLogger(),
  } as unknown as Logger;
};

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
});

afterAll(async () => {
  await testContext.cleanup();
});

const makeCommandContext = async (): Promise<CommandContext> => {
  const projectContext = await testContext.storageService.resolveProject(project.projectUUID);
  return {
    storageService: testContext.storageService,
    projectContext,
    actor: "user",
    correlationId: "test-correlation",
    logger: makeLogger(),
  };
};

const writeFragment = async (
  ctx: CommandContext,
  key: string,
  content: string,
  overrides: Partial<Fragment> = {},
): Promise<Fragment> => {
  const fragment: Fragment = {
    uuid: randomUUID(),
    key,
    content,
    readiness: 0.75,
    contentHash: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    references: [],
    isDiscarded: false,
    aspects: {},
    ...overrides,
  };
  return testContext.storageService.fragments.write(ctx.projectContext, fragment);
};

describe("splitFragmentCommand", () => {
  it("preserves the original's identity and metadata as piece 1", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `identity-${Date.now()}`,
      "# Intro\nIntro body\n# Middle\nMiddle body\n# End\nEnd body",
      {
        readiness: 0.6,
        references: ["some-ref"],
        aspects: { theme: { weight: 0.4 } },
      },
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      // Keep the heading in the body so the original retains its key (the default
      // strips the heading and renames the original — covered by its own test).
      keepHeadingInBody: true,
    });

    expect(result.sourceFragmentUuid).toBe(original.uuid);
    expect(result.createdCount).toBe(2);

    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.uuid).toBe(original.uuid);
    expect(reread.key).toBe(original.key);
    expect(reread.readiness).toBe(0.6);
    expect(reread.references).toEqual(["some-ref"]);
    expect(reread.aspects).toEqual({ theme: { weight: 0.4 } });
    // The heading line is retained — a split must not drop prose.
    expect(reread.content.trim()).toBe("# Intro\nIntro body");
  });

  it("creates new pieces inheriting aspects + references with readiness 0", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `inherit-${Date.now()}`,
      "# One\nBody one\n# Two\nBody two",
      {
        readiness: 0.9,
        references: ["ref-a", "ref-b"],
        aspects: { mood: { weight: 0.5 } },
      },
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      // Keep headings so the new piece's content includes its heading line.
      keepHeadingInBody: true,
    });

    expect(result.createdUuids).toHaveLength(1);
    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.readiness).toBe(0);
    expect(created.isDiscarded).toBe(false);
    expect(created.references).toEqual(["ref-a", "ref-b"]);
    expect(created.aspects).toEqual({ mood: { weight: 0.5 } });
    // The heading line is retained in the new piece's content too.
    expect(created.content.trim()).toBe("# Two\nBody two");
  });

  it("suffixes derived keys that conflict with existing keys", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    // Pre-existing fragment whose key matches the second piece's heading text.
    await writeFragment(ctx, `Beta ${stamp}`, "occupier");

    const original = await writeFragment(
      ctx,
      `conflict-${stamp}`,
      `# Alpha ${stamp}\nA body\n# Beta ${stamp}\nB body`,
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.key).toMatch(/_1$/);
  });

  it("gives every active fragment a distinct key when pieces derive the same base key", async () => {
    // Regression for the "document link points to the next fragment" bug: a link is stored as
    // `[[fragments/key]]` and resolved key→uuid at navigate time, so two active fragments sharing a
    // key would make a link resolve to the wrong one. When several pieces derive the same base key,
    // the split must suffix each so no two active fragments collide.
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `river-${stamp}`,
      "The river flowed.\n\nThe river flowed.\n\nThe river flowed.",
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "blank-line" },
    });
    expect(result.createdCount).toBe(2);

    const summaries = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    const activeKeys = summaries
      .filter((summary) => !summary.isDiscarded)
      .map((summary) => summary.key.toLowerCase());
    // No duplicate active key — the invariant the frontend link resolver relies on.
    expect(new Set(activeKeys).size).toBe(activeKeys.length);
  });

  it("applies user-chosen keys to the new pieces (piece 1 keeps the original key)", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `rename-src-${stamp}`,
      "# One\nBody one\n# Two\nBody two\n# Three\nBody three",
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      // Keep the heading so piece 1 (the original) retains its key.
      keepHeadingInBody: true,
      pieceKeys: [
        { pieceIndex: 2, key: `chosen-two-${stamp}` },
        { pieceIndex: 3, key: `chosen-three-${stamp}` },
      ],
    });

    // Piece 1 keeps the original's key.
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.key).toBe(original.key);

    const createdKeys = await Promise.all(
      result.createdUuids.map(async (uuid) => {
        const fragment = await ctx.storageService.fragments.read(ctx.projectContext, uuid);
        return fragment.key;
      }),
    );
    expect(createdKeys).toEqual([`chosen-two-${stamp}`, `chosen-three-${stamp}`]);
  });

  it("falls back to the derived key for pieces without an override", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const headingTwo = `DerivedTwo${stamp}`;
    const original = await writeFragment(
      ctx,
      `rename-partial-${stamp}`,
      `# One\nBody one\n# ${headingTwo}\nBody two`,
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      // No override for piece 2 → derived key from its heading text.
      pieceKeys: [],
    });

    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.key).toBe(headingTwo);
  });

  it("rejects an override key that collides with an existing fragment", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    await writeFragment(ctx, `taken-key-${stamp}`, "occupier");
    const original = await writeFragment(
      ctx,
      `rename-conflict-${stamp}`,
      "# One\nBody one\n# Two\nBody two",
    );

    await expect(
      splitFragmentCommand.execute(ctx, {
        fragmentId: original.uuid,
        delimiter: { type: "heading", level: 1 },
        pieceKeys: [{ pieceIndex: 2, key: `taken-key-${stamp}` }],
      }),
    ).rejects.toBeInstanceOf(SplitKeyConflictError);
  });

  it("rejects an invalid override key", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `rename-invalid-${Date.now()}`,
      "# One\nBody one\n# Two\nBody two",
    );

    await expect(
      splitFragmentCommand.execute(ctx, {
        fragmentId: original.uuid,
        delimiter: { type: "heading", level: 1 },
        pieceKeys: [{ pieceIndex: 2, key: "bad/slash:key" }],
      }),
    ).rejects.toBeInstanceOf(SplitKeyInvalidError);
  });

  it("rejects a single-piece (no-op) split and writes nothing", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `noop-${Date.now()}`,
      "Just prose, no thematic break anywhere",
    );

    await expect(
      splitFragmentCommand.execute(ctx, {
        fragmentId: original.uuid,
        delimiter: { type: "thematic-break" },
      }),
    ).rejects.toBeInstanceOf(SplitNoOpError);

    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.content.trim()).toBe("Just prose, no thematic break anywhere");
  });

  it("records exactly one non-undoable fragment:split entry (no per-piece fragment:created)", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `logentry-${Date.now()}`,
      "# P1\nbody 1\n# P2\nbody 2\n# P3\nbody 3",
    );

    const { logEntries } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    expect(logEntries).toHaveLength(1);
    const entry = logEntries[0]!;
    expect(entry.type).toBe("fragment:split");
    expect(entry.undoable).toBe(false);
    expect(entry.payload).toMatchObject({
      sourceFragmentUuid: original.uuid,
      delimiter: "heading:1",
      createdCount: 2,
    });
  });

  it("migrates a moved block's anchor marker + comment into the new piece's Margin", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `markers-${Date.now()}`,
      "First block <!--c:keepme-->\n\n---\n\nSecond block <!--c:moveme-->",
    );
    await ctx.storageService.margins.write(ctx.projectContext, original.uuid, {
      notes: "fragment-wide notes",
      comments: [
        { markerId: "keepme", excerpt: "First block", body: "a comment that stays" },
        { markerId: "moveme", excerpt: "Second block", body: "a comment that moves" },
      ],
    });

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "thematic-break" },
    });

    // The marker rides along: it stays on the original for the block that stayed,
    // and lands in the new piece for the block that moved.
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.content).toContain("<!--c:keepme-->");
    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.content).toContain("<!--c:moveme-->");
    expect(created.content).toContain("Second block");
    // The anchor marker must never leak into the derived key.
    expect(created.key).toMatch(/^Second block/);
    expect(created.key).not.toContain("c:");
    expect(created.key).not.toContain("moveme");

    // The original's Margin keeps only the comment whose block stayed (+ its notes).
    const originalMargin = await ctx.storageService.margins.read(ctx.projectContext, original.uuid);
    expect(originalMargin?.notes).toBe("fragment-wide notes");
    expect(originalMargin?.comments.map((comment) => comment.markerId)).toEqual(["keepme"]);

    // The moved comment migrated into the new piece's Margin, re-anchored.
    const createdMargin = await ctx.storageService.margins.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(createdMargin?.comments.map((comment) => comment.markerId)).toEqual(["moveme"]);
    expect(createdMargin?.comments[0]?.body).toBe("a comment that moves");
    // Notes belong to the original; the new piece's Margin carries none.
    expect(createdMargin?.notes).toBe("");
  });

  it("leaves a comment whose block stays in piece 1 untouched on the original", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `markers-stay-${Date.now()}`,
      "Kept block <!--c:stay-->\n\n---\n\nMoved block",
    );
    await ctx.storageService.margins.write(ctx.projectContext, original.uuid, {
      notes: "",
      comments: [{ markerId: "stay", excerpt: "Kept block", body: "stays put" }],
    });

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "thematic-break" },
    });

    const originalMargin = await ctx.storageService.margins.read(ctx.projectContext, original.uuid);
    expect(originalMargin?.comments.map((comment) => comment.markerId)).toEqual(["stay"]);
    // The new piece (no anchored block) gets no Margin.
    const createdMargin = await ctx.storageService.margins.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(createdMargin).toBeNull();
  });

  it("keeps a comment anchored on the original when its heading stays in piece 1", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `markers-heading-stay-${Date.now()}`,
      "# Heading <!--c:onheading-->\nBody one\n# Second\nBody two",
    );
    await ctx.storageService.margins.write(ctx.projectContext, original.uuid, {
      notes: "",
      comments: [{ markerId: "onheading", excerpt: "Heading", body: "anchored to the heading" }],
    });

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      keepHeadingInBody: true,
    });

    // The heading line is retained, so the first heading + its marker stay in
    // piece 1 — the comment stays anchored on the original, not orphaned.
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.content).toContain("# Heading");
    expect(reread.content).toContain("<!--c:onheading-->");

    const originalMargin = await ctx.storageService.margins.read(ctx.projectContext, original.uuid);
    expect(originalMargin?.comments.map((comment) => comment.markerId)).toEqual(["onheading"]);
    const createdMargin = await ctx.storageService.margins.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(createdMargin).toBeNull();
  });

  it("migrates a comment whose heading moves into a new piece (heading line retained)", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `markers-heading-move-${Date.now()}`,
      "Intro prose\n# Heading <!--c:onheading-->\nBody one",
    );
    await ctx.storageService.margins.write(ctx.projectContext, original.uuid, {
      notes: "",
      comments: [{ markerId: "onheading", excerpt: "Heading", body: "anchored to the heading" }],
    });

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      keepHeadingInBody: true,
    });

    // Piece 1 is the leading prose (no heading, no marker); the heading line and
    // its marker move into the new piece, so the comment migrates with it.
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.content.trim()).toBe("Intro prose");
    const originalMargin = await ctx.storageService.margins.read(ctx.projectContext, original.uuid);
    expect(originalMargin?.comments ?? []).toEqual([]);

    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.content).toContain("# Heading");
    expect(created.content).toContain("<!--c:onheading-->");
    const createdMargin = await ctx.storageService.margins.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(createdMargin?.comments.map((comment) => comment.markerId)).toEqual(["onheading"]);
  });

  it("preserves all prose across the resulting pieces (no content loss)", async () => {
    const ctx = await makeCommandContext();
    const body = "# Alpha\nBody A\n# Beta\nBody B\n# Gamma\nBody C";
    const original = await writeFragment(ctx, `no-loss-${Date.now()}`, body);

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      // Keep headings so rejoining the pieces reproduces the body verbatim (the
      // default moves each heading into a key instead — a separate concern).
      keepHeadingInBody: true,
    });

    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    const createdContents = await Promise.all(
      result.createdUuids.map(async (uuid) => {
        const fragment = await ctx.storageService.fragments.read(ctx.projectContext, uuid);
        return fragment.content.trim();
      }),
    );

    const rejoined = [reread.content.trim(), ...createdContents].join("\n");
    expect(rejoined).toBe(body);
  });

  it("inserts new pieces immediately after the original in every sequence it is placed in", async () => {
    const ctx = await makeCommandContext();
    const before = await writeFragment(ctx, `seq-before-${Date.now()}`, "before");
    const original = await writeFragment(
      ctx,
      `seq-original-${Date.now()}`,
      "# A\nbody A\n# B\nbody B\n# C\nbody C",
    );
    const after = await writeFragment(ctx, `seq-after-${Date.now()}`, "after");

    const sectionUuid = randomUUID();
    const sequence: Sequence = {
      uuid: randomUUID(),
      name: `Split Seq ${Date.now()}`,
      isMain: false,
      active: false,
      projectUuid: project.projectUUID,
      sections: [
        {
          uuid: sectionUuid,
          name: "Section",
          fragments: [
            { uuid: randomUUID(), fragmentUuid: before.uuid, position: 0 },
            { uuid: randomUUID(), fragmentUuid: original.uuid, position: 1 },
            { uuid: randomUUID(), fragmentUuid: after.uuid, position: 2 },
          ],
        },
      ],
    };
    await ctx.storageService.sequences.write(ctx.projectContext, sequence);

    const result = await executeCommand(splitFragmentCommand, "fragment:split", ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    const reread = await ctx.storageService.sequences.read(ctx.projectContext, sequence.uuid);
    const order = reread.sections[0]!.fragments.slice()
      .sort((a, b) => a.position - b.position)
      .map((placement) => placement.fragmentUuid);

    expect(order).toEqual([
      before.uuid,
      original.uuid,
      result.createdUuids[0]!,
      result.createdUuids[1]!,
      after.uuid,
    ]);
  });

  it("returns empty warnings on a clean split", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `clean-warnings-${Date.now()}`,
      "# One\nBody one\n# Two\nBody two",
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    expect(result.warnings).toEqual([]);
  });

  it("collects a sequence-write failure as a warning; the split itself commits", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `seq-fail-${Date.now()}`,
      "# One\nBody one\n# Two\nBody two",
    );
    const sectionUuid = randomUUID();
    const sequence: Sequence = {
      uuid: randomUUID(),
      name: `Seq Fail ${Date.now()}`,
      isMain: false,
      active: false,
      projectUuid: project.projectUUID,
      sections: [
        {
          uuid: sectionUuid,
          name: "Section",
          fragments: [{ uuid: randomUUID(), fragmentUuid: original.uuid, position: 0 }],
        },
      ],
    };
    await ctx.storageService.sequences.write(ctx.projectContext, sequence);

    // Inject a failure into the follow-up sequence write only — the core
    // fragment writes go through untouched.
    const failingContext: CommandContext = {
      ...ctx,
      storageService: {
        ...ctx.storageService,
        sequences: {
          ...ctx.storageService.sequences,
          write: () => Promise.reject(new Error("sequence write exploded")),
        },
      },
    };

    const { result } = await splitFragmentCommand.execute(failingContext, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      keepHeadingInBody: true,
    });

    // The split committed: new piece on disk, original truncated.
    expect(result.createdUuids).toHaveLength(1);
    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.content.trim()).toBe("# Two\nBody two");
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.content.trim()).toBe("# One\nBody one");

    // The failure surfaced as a warning naming the sequence, not a throw.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(sequence.name);
  });

  it("collects a Margin-migration failure as a warning; comments remain on the original", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `margin-fail-${Date.now()}`,
      "First block\n\n---\n\nSecond block <!--c:moveme-->",
    );
    await ctx.storageService.margins.write(ctx.projectContext, original.uuid, {
      notes: "",
      comments: [{ markerId: "moveme", excerpt: "Second block", body: "a comment that moves" }],
    });

    const failingContext: CommandContext = {
      ...ctx,
      storageService: {
        ...ctx.storageService,
        margins: {
          ...ctx.storageService.margins,
          write: () => Promise.reject(new Error("margin write exploded")),
        },
      },
    };

    const { result } = await splitFragmentCommand.execute(failingContext, {
      fragmentId: original.uuid,
      delimiter: { type: "thematic-break" },
    });

    // The split committed despite the Margin failure.
    expect(result.createdUuids).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Comments could not be migrated");

    // The comment was not lost: the original's Margin still holds it (the piece
    // Margins are written before the original's is rewritten, so a failure never
    // leaves a comment on neither side).
    const originalMargin = await ctx.storageService.margins.read(ctx.projectContext, original.uuid);
    expect(originalMargin?.comments.map((comment) => comment.markerId)).toEqual(["moveme"]);
  });

  it("a pre-write key conflict rejects with nothing written (validation precedes all writes)", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    await writeFragment(ctx, `prewrite-taken-${stamp}`, "occupier");
    const original = await writeFragment(
      ctx,
      `prewrite-src-${stamp}`,
      "# One\nBody one\n# Two\nBody two\n# Three\nBody three",
    );
    const summariesBefore = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);

    // Piece 2 gets a valid unique key; piece 3 collides. Key resolution happens
    // before the first write, so piece 2 must NOT be created.
    await expect(
      splitFragmentCommand.execute(ctx, {
        fragmentId: original.uuid,
        delimiter: { type: "heading", level: 1 },
        pieceKeys: [
          { pieceIndex: 2, key: `prewrite-fresh-${stamp}` },
          { pieceIndex: 3, key: `prewrite-taken-${stamp}` },
        ],
      }),
    ).rejects.toBeInstanceOf(SplitKeyConflictError);

    const summariesAfter = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    expect(summariesAfter.length).toBe(summariesBefore.length);
    expect(summariesAfter.some((summary) => summary.key === `prewrite-fresh-${stamp}`)).toBe(false);
    // The original is untouched — full prose intact.
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.content).toContain("Body three");
  });

  it("creates a new secondary sequence holding the pieces in split order when intoSequence is given", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `into-seq-${stamp}`,
      "# One\nBody one\n# Two\nBody two\n# Three\nBody three",
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      intoSequence: { name: `into-seq-${stamp} split` },
    });

    expect(result.createdCount).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.createdSequenceUuid).toBeDefined();
    expect(result.createdSequenceName).toBe(`into-seq-${stamp} split`);

    const sequence = await ctx.storageService.sequences.read(
      ctx.projectContext,
      result.createdSequenceUuid!,
    );
    // A plain user-authored secondary: not main, active, no origin.
    expect(sequence.isMain).toBe(false);
    expect(sequence.active).toBe(true);
    expect(sequence.origin).toBeUndefined();
    expect(sequence.name).toBe(`into-seq-${stamp} split`);
    // One "Main" section holding piece 1 (the original) then pieces 2…N in order.
    expect(sequence.sections).toHaveLength(1);
    expect(sequence.sections[0]!.name).toBe("Main");
    const order = sequence.sections[0]!.fragments.slice()
      .sort((a, b) => a.position - b.position)
      .map((placement) => placement.fragmentUuid);
    expect(order).toEqual([original.uuid, result.createdUuids[0]!, result.createdUuids[1]!]);
  });

  it("creates no sequence when intoSequence is omitted", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `no-into-seq-${Date.now()}`,
      "# One\nBody one\n# Two\nBody two",
    );
    const sequencesBefore = await ctx.storageService.sequences.readAll(ctx.projectContext);

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    expect(result.createdSequenceUuid).toBeUndefined();
    expect(result.createdSequenceName).toBeUndefined();
    const sequencesAfter = await ctx.storageService.sequences.readAll(ctx.projectContext);
    expect(sequencesAfter.length).toBe(sequencesBefore.length);
  });

  it("rejects a blank intoSequence name in Phase A with nothing written", async () => {
    const ctx = await makeCommandContext();
    const original = await writeFragment(
      ctx,
      `blank-seq-name-${Date.now()}`,
      "# One\nBody one\n# Two\nBody two",
    );
    const summariesBefore = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    const sequencesBefore = await ctx.storageService.sequences.readAll(ctx.projectContext);

    await expect(
      splitFragmentCommand.execute(ctx, {
        fragmentId: original.uuid,
        delimiter: { type: "heading", level: 1 },
        intoSequence: { name: "   " },
      }),
    ).rejects.toBeInstanceOf(SplitSequenceNameInvalidError);

    // Nothing written: no new fragments, no new sequence, original intact.
    const summariesAfter = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    expect(summariesAfter.length).toBe(summariesBefore.length);
    const sequencesAfter = await ctx.storageService.sequences.readAll(ctx.projectContext);
    expect(sequencesAfter.length).toBe(sequencesBefore.length);
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.content).toContain("Body two");
  });

  it("collects a sequence-creation failure as a warning; the split itself commits", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `into-seq-fail-${stamp}`,
      "# One\nBody one\n# Two\nBody two",
    );

    // Fail every sequence write — the core fragment writes go through untouched.
    const failingContext: CommandContext = {
      ...ctx,
      storageService: {
        ...ctx.storageService,
        sequences: {
          ...ctx.storageService.sequences,
          write: () => Promise.reject(new Error("sequence write exploded")),
        },
      },
    };

    const { result } = await splitFragmentCommand.execute(failingContext, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      keepHeadingInBody: true,
      intoSequence: { name: `into-seq-fail-${stamp} split` },
    });

    // The split committed despite the sequence-creation failure.
    expect(result.createdUuids).toHaveLength(1);
    expect(result.createdSequenceUuid).toBeUndefined();
    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.content.trim()).toBe("# Two\nBody two");
    // The failure surfaced as a warning naming the sequence, not a throw.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(`into-seq-fail-${stamp} split`);
  });

  it("records the created sequence on the fragment:split action-log payload", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `into-seq-log-${stamp}`,
      "# One\nBody one\n# Two\nBody two",
    );

    const { result, logEntries } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      intoSequence: { name: `into-seq-log-${stamp} split` },
    });

    expect(logEntries).toHaveLength(1);
    expect(logEntries[0]!.payload).toMatchObject({
      sourceFragmentUuid: original.uuid,
      createdSequenceUuid: result.createdSequenceUuid,
      createdSequenceName: `into-seq-log-${stamp} split`,
    });
  });

  it("places an unplaced original in the new sequence too (piece 1 first)", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    // The original is not placed in any existing sequence.
    const original = await writeFragment(
      ctx,
      `into-seq-unplaced-${stamp}`,
      "# One\nBody one\n# Two\nBody two",
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      intoSequence: { name: `into-seq-unplaced-${stamp} split` },
    });

    const sequence = await ctx.storageService.sequences.read(
      ctx.projectContext,
      result.createdSequenceUuid!,
    );
    const order = sequence.sections[0]!.fragments.slice()
      .sort((a, b) => a.position - b.position)
      .map((placement) => placement.fragmentUuid);
    expect(order).toEqual([original.uuid, result.createdUuids[0]!]);
  });

  it("strips the heading from each piece and derives keys from it by default", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `strip-src-${stamp}`,
      `# Chapter${stamp}\nBody one\n# Section${stamp}\nBody two`,
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    // The original (piece 1) is renamed to its leading heading, its body stripped.
    expect(result.originalKeyRenamedTo).toBe(`Chapter${stamp}`);
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.uuid).toBe(original.uuid);
    expect(reread.key).toBe(`Chapter${stamp}`);
    expect(reread.content.trim()).toBe("Body one");

    // The new piece is keyed by its heading, with the heading dropped from the body.
    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.key).toBe(`Section${stamp}`);
    expect(created.content.trim()).toBe("Body two");
  });

  it("records originalKeyRenamedTo on the fragment:split action-log payload", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `strip-log-${stamp}`,
      `# Renamed${stamp}\nBody one\n# Next${stamp}\nBody two`,
    );

    const { logEntries } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    expect(logEntries[0]!.payload).toMatchObject({
      sourceFragmentUuid: original.uuid,
      originalKeyRenamedTo: `Renamed${stamp}`,
    });
  });

  it("keeps the original's key when its body has no leading heading (nothing to rename)", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `strip-intro-${stamp}`,
      `Intro prose ${stamp}\n# Only${stamp}\nBody`,
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    // Piece 1 is the leading prose — no heading to become a key, so no rename.
    expect(result.originalKeyRenamedTo).toBeUndefined();
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.key).toBe(original.key);
    expect(reread.content.trim()).toBe(`Intro prose ${stamp}`);

    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    expect(created.key).toBe(`Only${stamp}`);
    expect(created.content.trim()).toBe("Body");
  });

  it("suffixes a later piece whose heading equals the original's old key while renaming the original", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const originalKey = `Src${stamp}`;
    // Piece 1's heading (Lead${stamp}) renames the original away from Src${stamp};
    // a later piece's heading reuses Src${stamp}. The rename runs after the pieces
    // are written, so the reused key must be suffixed — not collide mid-split.
    const original = await writeFragment(
      ctx,
      originalKey,
      `# Lead${stamp}\nBody one\n# ${originalKey}\nBody two`,
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    expect(result.originalKeyRenamedTo).toBe(`Lead${stamp}`);
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.key).toBe(`Lead${stamp}`);

    const created = await ctx.storageService.fragments.read(
      ctx.projectContext,
      result.createdUuids[0]!,
    );
    // The reused key is suffixed rather than colliding with the not-yet-renamed original.
    expect(created.key).toBe(`${originalKey}_1`);
  });

  it("keeps headings in the body and the original's key when keepHeadingInBody is true", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const original = await writeFragment(
      ctx,
      `keep-src-${stamp}`,
      `# Keep${stamp}\nBody one\n# Two${stamp}\nBody two`,
    );

    const { result } = await splitFragmentCommand.execute(ctx, {
      fragmentId: original.uuid,
      delimiter: { type: "heading", level: 1 },
      keepHeadingInBody: true,
    });

    expect(result.originalKeyRenamedTo).toBeUndefined();
    const reread = await ctx.storageService.fragments.read(ctx.projectContext, original.uuid);
    expect(reread.key).toBe(original.key);
    expect(reread.content.trim()).toBe(`# Keep${stamp}\nBody one`);
  });
});
