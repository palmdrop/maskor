import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { Fragment } from "@maskor/shared";
import type { CommandContext } from "../../commands/types";
import { previewSplitCommand } from "../../commands/fragments/preview-split";
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
): Promise<Fragment> => {
  const fragment: Fragment = {
    uuid: randomUUID(),
    key,
    content,
    readiness: 0.5,
    contentHash: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    references: [],
    isDiscarded: false,
    aspects: {},
  };
  return testContext.storageService.fragments.write(ctx.projectContext, fragment);
};

describe("previewSplitCommand", () => {
  it("derives one piece per heading occurrence and writes nothing", async () => {
    const ctx = await makeCommandContext();
    const fragment = await writeFragment(
      ctx,
      `split-headings-${Date.now()}`,
      "# Alpha\nBody A\n# Beta\nBody B\n# Gamma\nBody C",
    );

    const { result, logEntries } = await previewSplitCommand.execute(ctx, {
      fragmentId: fragment.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    expect(result.count).toBe(3);
    expect(result.pieces.map((piece) => piece.pieceIndex)).toEqual([1, 2, 3]);
    expect(logEntries).toHaveLength(0);
  });

  it("reports the original's existing key for piece 1", async () => {
    const ctx = await makeCommandContext();
    const key = `split-keeps-key-${Date.now()}`;
    const fragment = await writeFragment(ctx, key, "# Heading\nBody\n# Second\nMore");

    const { result } = await previewSplitCommand.execute(ctx, {
      fragmentId: fragment.uuid,
      delimiter: { type: "heading", level: 1 },
      // Keep the heading in the body so piece 1 reports the original's key (the
      // default strips it and reports the heading-derived rename instead).
      keepHeadingInBody: true,
    });

    expect(result.pieces[0]?.key).toBe(key);
    expect(result.pieces[0]?.renamedOriginal).toBeUndefined();
    // Piece 2's derived key must not collide with the original's key.
    expect(result.pieces[1]?.key).not.toBe(key);
  });

  it("renames piece 1 to its heading and derives every key by default (heading stripped)", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const fragment = await writeFragment(
      ctx,
      `preview-strip-${stamp}`,
      `# First${stamp}\nBody one\n# Second${stamp}\nBody two`,
    );

    const { result } = await previewSplitCommand.execute(ctx, {
      fragmentId: fragment.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    // Piece 1 reports the heading-derived key and flags the impending rename.
    expect(result.pieces[0]?.key).toBe(`First${stamp}`);
    expect(result.pieces[0]?.renamedOriginal).toBe(true);
    expect(result.pieces[1]?.key).toBe(`Second${stamp}`);
    // The excerpt no longer includes the stripped heading.
    expect(result.pieces[0]?.excerpt).not.toContain("#");
  });

  it("returns a single piece for a no-op delimiter", async () => {
    const ctx = await makeCommandContext();
    const fragment = await writeFragment(
      ctx,
      `split-noop-${Date.now()}`,
      "Just prose with no thematic break at all",
    );

    const { result } = await previewSplitCommand.execute(ctx, {
      fragmentId: fragment.uuid,
      delimiter: { type: "thematic-break" },
    });

    expect(result.count).toBe(1);
    expect(result.pieces[0]?.key).toBe(fragment.key);
  });

  it("splits on thematic breaks with derived keys + excerpts", async () => {
    const ctx = await makeCommandContext();
    const fragment = await writeFragment(
      ctx,
      `split-thematic-${Date.now()}`,
      "First part prose\n\n---\n\nSecond part prose\n\n---\n\nThird part prose",
    );

    const { result } = await previewSplitCommand.execute(ctx, {
      fragmentId: fragment.uuid,
      delimiter: { type: "thematic-break" },
    });

    expect(result.count).toBe(3);
    expect(result.pieces[0]?.excerpt).toContain("First part prose");
    expect(result.pieces[1]?.excerpt).toContain("Second part prose");
  });

  it("echoes the requested delimiter as appliedDelimiter", async () => {
    const ctx = await makeCommandContext();
    const fragment = await writeFragment(ctx, `split-applied-${Date.now()}`, "# A\nx\n# B\ny");

    const { result } = await previewSplitCommand.execute(ctx, {
      fragmentId: fragment.uuid,
      delimiter: { type: "heading", level: 1 },
    });

    expect(result.appliedDelimiter).toEqual({ type: "heading", level: 1 });
  });

  it("auto-selects a delimiter when none is requested (headings preferred)", async () => {
    const ctx = await makeCommandContext();
    const fragment = await writeFragment(
      ctx,
      `split-auto-heading-${Date.now()}`,
      "# Alpha\nBody A\n# Beta\nBody B",
    );

    const { result } = await previewSplitCommand.execute(ctx, { fragmentId: fragment.uuid });

    expect(result.appliedDelimiter).toEqual({ type: "heading", level: 1 });
    expect(result.count).toBe(2);
  });

  it("auto-selects thematic break when there are no headings", async () => {
    const ctx = await makeCommandContext();
    const fragment = await writeFragment(
      ctx,
      `split-auto-thematic-${Date.now()}`,
      "Prose one\n\n---\n\nProse two",
    );

    const { result } = await previewSplitCommand.execute(ctx, { fragmentId: fragment.uuid });

    expect(result.appliedDelimiter).toEqual({ type: "thematic-break" });
    expect(result.count).toBe(2);
  });

  it("falls back to a no-op heading default when nothing would split (never blank-line)", async () => {
    const ctx = await makeCommandContext();
    const fragment = await writeFragment(
      ctx,
      `split-auto-none-${Date.now()}`,
      "First paragraph.\n\nSecond paragraph.",
    );

    const { result } = await previewSplitCommand.execute(ctx, { fragmentId: fragment.uuid });

    expect(result.appliedDelimiter).toEqual({ type: "heading", level: 1 });
    expect(result.count).toBe(1);
  });
});
