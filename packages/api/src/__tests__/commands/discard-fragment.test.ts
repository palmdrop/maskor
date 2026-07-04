import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { Fragment, Sequence, SequenceOrigin } from "@maskor/shared";
import type { CommandContext } from "../../commands/types";
import { executeCommand } from "../../commands/types";
import { discardFragmentCommand } from "../../commands/fragments/discard-fragment";
import { restoreFragmentCommand } from "../../commands/fragments/restore-fragment";
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

const writeFragment = async (ctx: CommandContext, key: string): Promise<Fragment> => {
  const fragment: Fragment = {
    uuid: randomUUID(),
    key,
    content: `Body of ${key}`,
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

const writeSequence = async (
  ctx: CommandContext,
  name: string,
  fragmentUuids: string[],
  origin?: SequenceOrigin,
): Promise<Sequence> => {
  const sequence: Sequence = {
    uuid: randomUUID(),
    name,
    isMain: false,
    active: false,
    projectUuid: project.projectUUID,
    sections: [
      {
        uuid: randomUUID(),
        name: "Section",
        fragments: fragmentUuids.map((fragmentUuid, index) => ({
          uuid: randomUUID(),
          fragmentUuid,
          position: index,
        })),
      },
    ],
    ...(origin ? { origin } : {}),
  };
  await testContext.storageService.sequences.write(ctx.projectContext, sequence);
  return sequence;
};

const placedFragmentUuids = (sequence: { sections: { fragments: { fragmentUuid: string }[] }[] }) =>
  sequence.sections.flatMap((section) => section.fragments.map((f) => f.fragmentUuid));

describe("discardFragmentCommand", () => {
  it("removes the fragment from every mutable sequence it is placed in", async () => {
    const ctx = await makeCommandContext();
    const keep = await writeFragment(ctx, `discard-keep-${Date.now()}`);
    const target = await writeFragment(ctx, `discard-target-${Date.now()}`);
    const sequenceOne = await writeSequence(ctx, `Discard Seq A ${Date.now()}`, [
      keep.uuid,
      target.uuid,
    ]);
    const sequenceTwo = await writeSequence(ctx, `Discard Seq B ${Date.now()}`, [target.uuid]);

    await executeCommand(discardFragmentCommand, "fragment:discard", ctx, {
      fragmentId: target.uuid,
      fragmentKey: target.key,
    });

    const rereadOne = await ctx.storageService.sequences.read(ctx.projectContext, sequenceOne.uuid);
    const rereadTwo = await ctx.storageService.sequences.read(ctx.projectContext, sequenceTwo.uuid);
    expect(placedFragmentUuids(rereadOne)).toEqual([keep.uuid]);
    expect(placedFragmentUuids(rereadTwo)).toEqual([]);
    // Positions stay dense after the removal.
    expect(rereadOne.sections[0]!.fragments.every((f, index) => f.position === index)).toBe(true);
  });

  it("records the removed sequence uuids on the single fragment:discarded entry", async () => {
    const ctx = await makeCommandContext();
    const target = await writeFragment(ctx, `discard-payload-${Date.now()}`);
    const sequence = await writeSequence(ctx, `Discard Payload Seq ${Date.now()}`, [target.uuid]);

    const { logEntries } = await discardFragmentCommand.execute(ctx, {
      fragmentId: target.uuid,
      fragmentKey: target.key,
    });

    expect(logEntries).toHaveLength(1);
    const [entry] = logEntries;
    expect(entry!.type).toBe("fragment:discarded");
    expect(
      (entry!.payload as { unplacedFromSequenceUuids: string[] }).unplacedFromSequenceUuids,
    ).toEqual([sequence.uuid]);
  });

  it("leaves sequences untouched when discarding an unplaced fragment", async () => {
    const ctx = await makeCommandContext();
    const placed = await writeFragment(ctx, `discard-other-${Date.now()}`);
    const target = await writeFragment(ctx, `discard-unplaced-${Date.now()}`);
    const sequence = await writeSequence(ctx, `Discard Unplaced Seq ${Date.now()}`, [placed.uuid]);

    const { logEntries } = await discardFragmentCommand.execute(ctx, {
      fragmentId: target.uuid,
      fragmentKey: target.key,
    });

    const reread = await ctx.storageService.sequences.read(ctx.projectContext, sequence.uuid);
    expect(placedFragmentUuids(reread)).toEqual([placed.uuid]);
    expect(
      (logEntries[0]!.payload as { unplacedFromSequenceUuids: string[] }).unplacedFromSequenceUuids,
    ).toEqual([]);
  });

  it("leaves read-only import-sequences intact", async () => {
    const ctx = await makeCommandContext();
    const target = await writeFragment(ctx, `discard-import-${Date.now()}`);
    const importSequence = await writeSequence(
      ctx,
      `Discard Import Seq ${Date.now()}`,
      [target.uuid],
      {
        fileName: "import.md",
        archivePath: "archive/import.md",
        format: "markdown",
        importedAt: new Date().toISOString(),
      },
    );

    const { logEntries } = await discardFragmentCommand.execute(ctx, {
      fragmentId: target.uuid,
      fragmentKey: target.key,
    });

    // The frozen snapshot's file is never rewritten — its imported placement
    // stays on disk (source of truth). (The discard cascade transiently drops the
    // placement from the index until the next rebuild; that is the pre-existing
    // fragment_positions cascade bug noted in references/suggestions.md, not a
    // consequence of this command touching the import-sequence.)
    const sequenceFilePath = join(
      ctx.projectContext.vaultPath,
      ".maskor",
      "sequences",
      `${importSequence.uuid}.yaml`,
    );
    const rawYaml = await Bun.file(sequenceFilePath).text();
    expect(rawYaml).toContain(target.uuid);
    expect(
      (logEntries[0]!.payload as { unplacedFromSequenceUuids: string[] }).unplacedFromSequenceUuids,
    ).toEqual([]);
  });

  it("restore does not re-place the fragment into its former sequences", async () => {
    const ctx = await makeCommandContext();
    const target = await writeFragment(ctx, `discard-restore-${Date.now()}`);
    const sequence = await writeSequence(ctx, `Discard Restore Seq ${Date.now()}`, [target.uuid]);

    await executeCommand(discardFragmentCommand, "fragment:discard", ctx, {
      fragmentId: target.uuid,
      fragmentKey: target.key,
    });
    await executeCommand(restoreFragmentCommand, "fragment:restore", ctx, {
      fragmentId: target.uuid,
      fragmentKey: target.key,
    });

    const reread = await ctx.storageService.sequences.read(ctx.projectContext, sequence.uuid);
    expect(placedFragmentUuids(reread)).toEqual([]);
    const fragment = await ctx.storageService.fragments.read(ctx.projectContext, target.uuid);
    expect(fragment.isDiscarded).toBe(false);
  });
});
