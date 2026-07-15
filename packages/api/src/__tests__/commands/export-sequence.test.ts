import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { Fragment, Reference, Sequence } from "@maskor/shared";
import { buildCommentMarker } from "@maskor/shared";
import type { CommandContext } from "../../commands/types";
import { exportSequenceCommand } from "../../commands/exports/export-sequence";

const makeLogger = () => {
  const noOp = () => {};
  return {
    info: noOp,
    warn: noOp,
    debug: noOp,
    error: noOp,
    child: () => makeLogger(),
  } as unknown as CommandContext["logger"];
};

let testContext: ReturnType<typeof createTestApp>;
let projectUuid: string;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  projectUuid = seeded.project.projectUUID;
});

afterAll(async () => {
  await testContext.cleanup();
});

const makeCommandContext = async (): Promise<CommandContext> => {
  const projectContext = await testContext.storageService.resolveProject(projectUuid);
  return {
    storageService: testContext.storageService,
    projectContext,
    actor: "user",
    correlationId: "test-correlation",
    logger: makeLogger(),
  };
};

const writeReference = async (
  ctx: CommandContext,
  key: string,
  content: string,
): Promise<Reference> => {
  const reference: Reference = { uuid: randomUUID(), key, content };
  await testContext.storageService.references.write(ctx.projectContext, reference);
  return reference;
};

const writeFragment = async (
  ctx: CommandContext,
  key: string,
  content: string,
  references: string[] = [],
): Promise<Fragment> => {
  const fragment: Fragment = {
    uuid: randomUUID(),
    key,
    content,
    readiness: 0.5,
    contentHash: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    references,
    isDiscarded: false,
    aspects: {},
  };
  return testContext.storageService.fragments.write(ctx.projectContext, fragment);
};

const writeSequence = async (
  ctx: CommandContext,
  name: string,
  fragmentUuids: string[],
): Promise<Sequence> => {
  const sequence: Sequence = {
    uuid: randomUUID(),
    name,
    isMain: false,
    active: false,
    projectUuid,
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
  };
  await testContext.storageService.sequences.write(ctx.projectContext, sequence);
  return sequence;
};

describe("exportSequenceCommand annotations", () => {
  it("threads references and margin annotations into the output when toggles are on", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    await writeReference(ctx, `annot-ref-${stamp}`, "Reference prose about the harbour.");
    const anchoredMarker = "anchored1";
    const content = `Opening block ${buildCommentMarker(anchoredMarker)}\n\nSecond block.`;
    const fragment = await writeFragment(ctx, `annot-frag-${stamp}`, content, [
      `annot-ref-${stamp}`,
    ]);
    await testContext.storageService.margins.write(ctx.projectContext, fragment.uuid, {
      notes: "Whole-fragment note prose.",
      comments: [
        { markerId: anchoredMarker, excerpt: "Opening block", body: "Anchored comment body." },
      ],
    });
    const sequence = await writeSequence(ctx, `Annot Seq On ${stamp}`, [fragment.uuid]);

    const { result } = await exportSequenceCommand.execute(ctx, {
      sequenceId: sequence.uuid,
      format: "md",
      includeReferences: true,
      includeMarginAnnotations: true,
    });

    const markdown = new TextDecoder().decode(result.bytes);
    // Reference body rendered as a footnote definition.
    expect(markdown).toContain("Reference prose about the harbour.");
    // Margin note + anchored comment bodies rendered as footnote definitions.
    expect(markdown).toContain("Whole-fragment note prose.");
    expect(markdown).toContain("Anchored comment body.");
    // Footnote syntax present.
    expect(markdown).toContain("[^");
    expect(result.warnings).toEqual([]);
  });

  it("produces plain output with no footnotes when toggles are off", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    await writeReference(ctx, `plain-ref-${stamp}`, "Reference prose that must not appear.");
    const content = `Body ${buildCommentMarker("plainmarker")}`;
    const fragment = await writeFragment(ctx, `plain-frag-${stamp}`, content, [
      `plain-ref-${stamp}`,
    ]);
    await testContext.storageService.margins.write(ctx.projectContext, fragment.uuid, {
      notes: "Note that must not appear.",
      comments: [
        { markerId: "plainmarker", excerpt: "Body", body: "Comment that must not appear." },
      ],
    });
    const sequence = await writeSequence(ctx, `Annot Seq Off ${stamp}`, [fragment.uuid]);

    const { result } = await exportSequenceCommand.execute(ctx, {
      sequenceId: sequence.uuid,
      format: "md",
      includeReferences: false,
      includeMarginAnnotations: false,
    });

    const markdown = new TextDecoder().decode(result.bytes);
    expect(markdown).not.toContain("Reference prose that must not appear.");
    expect(markdown).not.toContain("Note that must not appear.");
    expect(markdown).not.toContain("Comment that must not appear.");
    expect(markdown).not.toContain("[^");
    // Marker itself is stripped from the plain body.
    expect(markdown).not.toContain("<!--c:");
    expect(result.warnings).toEqual([]);
  });

  it("populates orphan warnings for a margin comment whose marker is absent from the body", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const fragment = await writeFragment(ctx, `orphan-frag-${stamp}`, "Body with no markers.");
    await testContext.storageService.margins.write(ctx.projectContext, fragment.uuid, {
      notes: "",
      comments: [{ markerId: "missingmarker", excerpt: "gone", body: "Orphaned comment body." }],
    });
    const sequence = await writeSequence(ctx, `Orphan Seq ${stamp}`, [fragment.uuid]);

    const { result } = await exportSequenceCommand.execute(ctx, {
      sequenceId: sequence.uuid,
      format: "md",
      includeReferences: true,
      includeMarginAnnotations: true,
    });

    expect(result.warnings).toEqual([{ fragmentKey: fragment.key, count: 1 }]);
    // The orphaned body is not rendered.
    const markdown = new TextDecoder().decode(result.bytes);
    expect(markdown).not.toContain("Orphaned comment body.");
  });

  it("lets a body override beat the persisted project config", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    // Persist config with references OFF.
    await testContext.storageService.updateProject(projectUuid, {
      export: { includeReferences: false, includeMarginAnnotations: false },
    });
    await writeReference(ctx, `override-ref-${stamp}`, "Override reference prose.");
    const fragment = await writeFragment(ctx, `override-frag-${stamp}`, "Override body.", [
      `override-ref-${stamp}`,
    ]);
    const sequence = await writeSequence(ctx, `Override Seq ${stamp}`, [fragment.uuid]);

    // Body override turns references ON despite config being OFF.
    const { result } = await exportSequenceCommand.execute(ctx, {
      sequenceId: sequence.uuid,
      format: "md",
      includeReferences: true,
    });

    const markdown = new TextDecoder().decode(result.bytes);
    expect(markdown).toContain("Override reference prose.");

    // Restore defaults so other tests are unaffected.
    await testContext.storageService.updateProject(projectUuid, {
      export: { includeReferences: true, includeMarginAnnotations: true },
    });
  });

  it("falls back to project config when no body override is present", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    await testContext.storageService.updateProject(projectUuid, {
      export: { includeReferences: false, includeMarginAnnotations: false },
    });
    await writeReference(ctx, `config-ref-${stamp}`, "Config-driven reference prose.");
    const fragment = await writeFragment(ctx, `config-frag-${stamp}`, "Config body.", [
      `config-ref-${stamp}`,
    ]);
    const sequence = await writeSequence(ctx, `Config Seq ${stamp}`, [fragment.uuid]);

    const { result, logEntries } = await exportSequenceCommand.execute(ctx, {
      sequenceId: sequence.uuid,
      format: "md",
    });

    const markdown = new TextDecoder().decode(result.bytes);
    expect(markdown).not.toContain("Config-driven reference prose.");

    // Effective toggle state is recorded on the action-log payload.
    const payload = logEntries[0]!.payload as {
      includeReferences: boolean;
      includeMarginAnnotations: boolean;
    };
    expect(payload.includeReferences).toBe(false);
    expect(payload.includeMarginAnnotations).toBe(false);

    await testContext.storageService.updateProject(projectUuid, {
      export: { includeReferences: true, includeMarginAnnotations: true },
    });
  });

  it("assembles with the export config's assembly options when no override is present", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const first = await writeFragment(ctx, `options-first-${stamp}`, "First body.");
    const second = await writeFragment(ctx, `options-second-${stamp}`, "Second body.");
    const sequence = await writeSequence(ctx, `Options Seq ${stamp}`, [first.uuid, second.uuid]);

    // Config defaults: titles off, section headings on, blank-line separator.
    const { result } = await exportSequenceCommand.execute(ctx, {
      sequenceId: sequence.uuid,
      format: "md",
    });

    const markdown = new TextDecoder().decode(result.bytes);
    expect(markdown).not.toContain(`### ${first.key}`);
    expect(markdown).toContain("## Section");
    // Blank-line separator: the explicit non-breaking-space paragraph.
    expect(markdown).toContain("\u00a0");
    expect(markdown).not.toContain("\f");
  });

  it("lets body assembly-option overrides beat the export config", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    const first = await writeFragment(ctx, `override-options-first-${stamp}`, "First body.");
    const second = await writeFragment(ctx, `override-options-second-${stamp}`, "Second body.");
    const sequence = await writeSequence(ctx, `Override Options Seq ${stamp}`, [
      first.uuid,
      second.uuid,
    ]);

    const { result, logEntries } = await exportSequenceCommand.execute(ctx, {
      sequenceId: sequence.uuid,
      format: "md",
      showTitles: true,
      showSectionHeadings: false,
      separator: "page-break",
    });

    const markdown = new TextDecoder().decode(result.bytes);
    expect(markdown).toContain(`### ${first.key}`);
    expect(markdown).toContain(`### ${second.key}`);
    expect(markdown).not.toContain("## Section");
    // One page-break separator between the two fragments, not trailing.
    expect(markdown.match(/\f/g)).toHaveLength(1);

    // Effective assembly-option state is recorded on the action-log payload.
    const payload = logEntries[0]!.payload as {
      showTitles: boolean;
      showSectionHeadings: boolean;
      separator: string;
    };
    expect(payload.showTitles).toBe(true);
    expect(payload.showSectionHeadings).toBe(false);
    expect(payload.separator).toBe("page-break");
  });

  it("handles a missing Margin and an unresolvable reference key without crashing", async () => {
    const ctx = await makeCommandContext();
    const stamp = Date.now();
    // Fragment attaches a reference key that has no matching reference entity.
    const fragment = await writeFragment(ctx, `dangling-frag-${stamp}`, "Body without margin.", [
      `does-not-exist-${stamp}`,
    ]);
    const sequence = await writeSequence(ctx, `Dangling Seq ${stamp}`, [fragment.uuid]);

    const { result } = await exportSequenceCommand.execute(ctx, {
      sequenceId: sequence.uuid,
      format: "md",
      includeReferences: true,
      includeMarginAnnotations: true,
    });

    const markdown = new TextDecoder().decode(result.bytes);
    expect(markdown).toContain("Body without margin.");
    expect(result.warnings).toEqual([]);
  });
});
