import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { Sequence } from "@maskor/shared";
import type { CommandContext } from "../../commands/types";
import { createPreviewImportCommand } from "../../commands/fragments/preview-import";
import { createImportCommand } from "../../commands/fragments/import";
import type { DocumentConverter } from "@maskor/importer";
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

const makeStubConverter = (output: string): DocumentConverter => ({
  toMarkdown: async () => output,
});

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

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
    logger: makeLogger(),
  };
};

describe("createPreviewImportCommand - markdown", () => {
  it("happy path: returns pieces and convertedMarkdown without creating fragments", async () => {
    const ctx = await makeCommandContext();
    const markdownContent = `# First Section\n\nFirst body.\n\n# Second Section\n\nSecond body.`;
    const command = createPreviewImportCommand(makeStubConverter(""));

    const { result, logEntries } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(markdownContent),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.pieces.length).toBe(2);
    expect(result.format).toBe("markdown");
    expect(result.convertedMarkdown).toBe(markdownContent);
    expect(logEntries).toHaveLength(0);
  });

  it("returns 1-based pieceIndex", async () => {
    const ctx = await makeCommandContext();
    const markdownContent = `# A\n\nContent A.\n\n# B\n\nContent B.\n\n# C\n\nContent C.`;
    const command = createPreviewImportCommand(makeStubConverter(""));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(markdownContent),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.pieces.map((p) => p.pieceIndex)).toEqual([1, 2, 3]);
  });

  it("returns title from heading", async () => {
    const ctx = await makeCommandContext();
    const markdownContent = `# My Heading\n\nContent here.`;
    const command = createPreviewImportCommand(makeStubConverter(""));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(markdownContent),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.pieces[0]?.title).toBe("My Heading");
    expect(result.pieces[0]?.derivedKey).toBe("My Heading");
  });
});

describe("createPreviewImportCommand - plaintext", () => {
  it("happy path: splits on delimiter and returns preview pieces", async () => {
    const ctx = await makeCommandContext();
    const content = `First piece content\n---\nSecond piece content\n---\nThird piece content`;
    const command = createPreviewImportCommand(makeStubConverter(""));

    const { result, logEntries } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.txt",
      format: "plaintext",
      delimiter: "---",
    });

    expect(result.pieces.length).toBe(3);
    expect(result.format).toBe("plaintext");
    expect(logEntries).toHaveLength(0);
  });
});

describe("createPreviewImportCommand - docx", () => {
  it("happy path: uses converter and returns preview pieces", async () => {
    const ctx = await makeCommandContext();
    const converterOutput = `# Doc Heading\n\nDoc body text.\n\n## Sub Heading\n\nSub body.`;
    const command = createPreviewImportCommand(makeStubConverter(converterOutput));

    const { result, logEntries } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: new Uint8Array([1, 2, 3]),
      sourceFileName: "sample.docx",
      format: "docx",
      headingLevel: 2,
    });

    expect(result.pieces.length).toBe(2);
    expect(result.format).toBe("docx");
    expect(result.convertedMarkdown).toBe(converterOutput);
    expect(logEntries).toHaveLength(0);
  });
});

describe("createPreviewImportCommand - key collision", () => {
  it("returns suffixed key when collision with existing fragment", async () => {
    const ctx = await makeCommandContext();

    const uniqueHeading = `Preview Collision Test ${Date.now()}`;
    // First create a real fragment to seed a collision
    await testContext.app.request(`/projects/${project.projectUUID}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: uniqueHeading, content: "existing" }),
    });

    const content = `# ${uniqueHeading}\n\nNew content here.`;
    const command = createPreviewImportCommand(makeStubConverter(""));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.pieces.length).toBe(1);
    expect(result.pieces[0]?.derivedKey).toMatch(/_1$/);
  });
});

describe("createPreviewImportCommand - re-import warning", () => {
  it("returns priorImport when a file of the same name was imported before", async () => {
    const ctx = await makeCommandContext();
    const fileName = `reimport-${Date.now()}.md`;

    // First, a real import to lay down an import-sequence with this origin.fileName.
    await createImportCommand(makeStubConverter("")).execute(ctx, {
      projectId: project.projectUUID,
      file: encode(`# Prior ${Date.now()}\n\nPrior body.`),
      sourceFileName: fileName,
      format: "markdown",
      headingLevel: 1,
    });

    const { result } = await createPreviewImportCommand(makeStubConverter("")).execute(ctx, {
      projectId: project.projectUUID,
      file: encode(`# Again\n\nAgain body.`),
      sourceFileName: fileName,
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.priorImport).toBeDefined();
    expect(result.priorImport!.sequenceName).toBe(`Import: ${fileName}`);
    expect(typeof result.priorImport!.importedAt).toBe("string");
  });

  it("cites the most recent prior import when the same name was imported twice", async () => {
    const ctx = await makeCommandContext();
    const fileName = `twice-${Date.now()}.md`;

    // Two import-sequences sharing this origin.fileName, written directly with
    // controlled importedAt so the "most recent" tiebreak is deterministic.
    const makeImportSequence = (name: string, importedAt: string): Sequence => ({
      uuid: randomUUID(),
      name,
      isMain: false,
      active: false,
      projectUuid: project.projectUUID,
      sections: [{ uuid: randomUUID(), name: "Import", fragments: [] }],
      origin: {
        fileName,
        archivePath: `.maskor/imports/${randomUUID()}.md`,
        format: "markdown",
        importedAt,
      },
    });

    await ctx.storageService.sequences.write(
      ctx.projectContext,
      makeImportSequence("Older import", "2026-05-30T08:00:00.000Z"),
    );
    await ctx.storageService.sequences.write(
      ctx.projectContext,
      makeImportSequence("Newer import", "2026-05-31T09:00:00.000Z"),
    );

    const { result } = await createPreviewImportCommand(makeStubConverter("")).execute(ctx, {
      projectId: project.projectUUID,
      file: encode(`# Yet again\n\nBody.`),
      sourceFileName: fileName,
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.priorImport).toBeDefined();
    expect(result.priorImport!.sequenceName).toBe("Newer import");
    expect(result.priorImport!.importedAt).toBe("2026-05-31T09:00:00.000Z");
  });

  it("omits priorImport for a never-before-seen file name", async () => {
    const ctx = await makeCommandContext();
    const { result } = await createPreviewImportCommand(makeStubConverter("")).execute(ctx, {
      projectId: project.projectUUID,
      file: encode(`# Fresh\n\nFresh body.`),
      sourceFileName: `fresh-${Date.now()}.md`,
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.priorImport).toBeUndefined();
  });
});

describe("createPreviewImportCommand - zero-piece case", () => {
  it("returns empty pieces array when H1 heading has no body content", async () => {
    const ctx = await makeCommandContext();
    // H1 heading with no body: splitMarkdown filters the empty section
    const content = `# Heading Only\n\n`;
    const command = createPreviewImportCommand(makeStubConverter(""));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.pieces).toHaveLength(0);
    expect(result.convertedMarkdown).toBe(content);
  });
});
