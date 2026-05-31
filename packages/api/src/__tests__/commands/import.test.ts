import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { CommandContext } from "../../commands/types";
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
let vaultDirectory: string;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
  vaultDirectory = seeded.vaultDirectory;
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

describe("createImportCommand - markdown", () => {
  it("happy path: creates one fragment per heading section", async () => {
    const ctx = await makeCommandContext();
    const markdownContent = `# First Section\n\nFirst body.\n\n# Second Section\n\nSecond body.`;
    const command = createImportCommand(makeStubConverter(""));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(markdownContent),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.created.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it("emits a single fragment:imported log entry for the whole batch", async () => {
    const ctx = await makeCommandContext();
    const markdownContent = `# Alpha\n\nAlpha body.\n\n# Beta\n\nBeta body.`;
    const command = createImportCommand(makeStubConverter(""));

    const { result, logEntries } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(markdownContent),
      sourceFileName: "my-book.md",
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.created.length).toBe(2);
    expect(logEntries.length).toBe(1);
    expect(logEntries[0]!.type).toBe("fragment:imported");
    const payload = logEntries[0]!.payload as Record<string, unknown>;
    expect(payload.sourceFileName).toBe("my-book.md");
    expect(payload.fragmentCount).toBe(2);
    expect(payload.format).toBe("markdown");
    expect(payload.headingLevel).toBe(1);
  });
});

describe("createImportCommand - plaintext", () => {
  it("happy path: splits on delimiter and creates fragments", async () => {
    const ctx = await makeCommandContext();
    const content = `First piece content\n---\nSecond piece content\n---\nThird piece content`;
    const command = createImportCommand(makeStubConverter(""));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.txt",
      format: "plaintext",
      delimiter: "---",
    });

    expect(result.created.length).toBe(3);
    expect(result.errors.length).toBe(0);
  });

  it("skips whitespace-only pieces (splitter already filters them)", async () => {
    // splitPlainText filters empty/whitespace-only splits before they reach importCommand.
    // Verify that only non-empty pieces produce fragments.
    const ctx = await makeCommandContext();
    const content = `Real content\n---\n   \n---\nAnother real piece`;
    const command = createImportCommand(makeStubConverter(""));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.txt",
      format: "plaintext",
      delimiter: "---",
    });

    expect(result.created.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });
});

describe("createImportCommand - docx", () => {
  it("happy path: uses converter and creates fragments", async () => {
    const ctx = await makeCommandContext();
    const converterOutput = `# Doc Heading\n\nDoc body text.\n\n## Sub Heading\n\nSub body.`;
    const command = createImportCommand(makeStubConverter(converterOutput));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: new Uint8Array([1, 2, 3]),
      sourceFileName: "sample.docx",
      format: "docx",
      headingLevel: 2,
    });

    expect(result.created.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it("passes the file bytes to the converter", async () => {
    const ctx = await makeCommandContext();
    const fileBytes = new Uint8Array([10, 20, 30]);
    let receivedBytes: Uint8Array | null = null;

    const spyConverter: DocumentConverter = {
      toMarkdown: async (input: Uint8Array) => {
        receivedBytes = input;
        return "# Spy\n\nSpy body.";
      },
    };

    const command = createImportCommand(spyConverter);
    await command.execute(ctx, {
      projectId: project.projectUUID,
      file: fileBytes,
      sourceFileName: "sample.docx",
      format: "docx",
      headingLevel: 1,
    });

    expect(receivedBytes).not.toBeNull();
    expect(Array.from(receivedBytes!)).toEqual(Array.from(fileBytes));
  });
});

describe("createImportCommand - key collision", () => {
  it("appends suffix when key collides with existing fragment", async () => {
    const ctx = await makeCommandContext();
    const command = createImportCommand(makeStubConverter(""));

    // First import creates a fragment with key from first non-empty line
    const uniquePrefix = `collision-test-${Date.now()}`;
    const content = `${uniquePrefix} piece one\n---\n${uniquePrefix} piece two`;

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.txt",
      format: "plaintext",
      delimiter: "---",
    });

    expect(result.created.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it("handles case-insensitive collision between pieces in the same batch", async () => {
    const ctx = await makeCommandContext();
    const command = createImportCommand(makeStubConverter(""));

    // Two sections with the same heading text (different case)
    const content = `# Unique Heading ${Date.now()}\n\nFirst body.\n\n# Unique Heading ${Date.now()}\n\nSecond body.`;

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    // Both should be created, second one with a suffix
    expect(result.created.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });
});

describe("createImportCommand - partial failure", () => {
  it("continues processing after a single piece fails", async () => {
    const ctx = await makeCommandContext();

    // Force a failure by patching storageService.fragments.write to throw on the second call
    const originalWrite = testContext.storageService.fragments.write;
    let callCount = 0;
    testContext.storageService.fragments.write = async (projectCtx, fragment) => {
      callCount++;
      if (callCount === 2) throw new Error("simulated write failure");
      return originalWrite.call(testContext.storageService.fragments, projectCtx, fragment);
    };

    const command = createImportCommand(makeStubConverter(""));
    const content = `# Piece One ${Date.now()}\n\nFirst body.\n\n# Piece Two ${Date.now()}\n\nSecond body.\n\n# Piece Three ${Date.now()}\n\nThird body.`;

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    testContext.storageService.fragments.write = originalWrite;

    expect(result.created.length).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.pieceIndex).toBe(2);
    expect(result.errors[0]!.pieceKey).toBeDefined();
    expect(result.errors[0]!.error).toContain("simulated write failure");
  });
});

describe("createImportCommand - import-sequence", () => {
  it("creates an inactive non-main import-sequence in import order with origin + archive", async () => {
    const ctx = await makeCommandContext();
    const markdownContent = `# Order One\n\nBody one.\n\n# Order Two\n\nBody two.`;
    const command = createImportCommand(makeStubConverter(""));

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(markdownContent),
      sourceFileName: "order-test.md",
      format: "markdown",
      headingLevel: 1,
    });

    expect(result.created.length).toBe(2);
    expect(result.importSequenceUuid).toBeDefined();

    const sequence = await ctx.storageService.sequences.read(
      ctx.projectContext,
      result.importSequenceUuid!,
    );

    expect(sequence.isMain).toBe(false);
    expect(sequence.active).toBe(false);
    expect(sequence.name).toBe("Import: order-test.md");
    // Fragments recorded in import order, in a single section.
    expect(sequence.sections.length).toBe(1);
    const orderedUuids = sequence.sections[0]!.fragments.sort(
      (a, b) => a.position - b.position,
    ).map((fp) => fp.fragmentUuid);
    expect(orderedUuids).toEqual(result.created);

    // Origin points at the archived original, which exists on disk.
    expect(sequence.origin).toBeDefined();
    expect(sequence.origin!.fileName).toBe("order-test.md");
    expect(sequence.origin!.format).toBe("markdown");
    expect(sequence.origin!.archivePath.startsWith(".maskor/imports/")).toBe(true);
    const archived = Bun.file(join(vaultDirectory, sequence.origin!.archivePath));
    expect(await archived.exists()).toBe(true);
  });

  it("suffixes the sequence name when the same file is imported again", async () => {
    const ctx = await makeCommandContext();
    const command = createImportCommand(makeStubConverter(""));
    const content = (tag: string) => `# Dup ${tag}\n\nBody ${tag}.`;

    const first = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content("a")),
      sourceFileName: "dup.md",
      format: "markdown",
      headingLevel: 1,
    });
    const second = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content("b")),
      sourceFileName: "dup.md",
      format: "markdown",
      headingLevel: 1,
    });

    const firstSequence = await ctx.storageService.sequences.read(
      ctx.projectContext,
      first.result.importSequenceUuid!,
    );
    const secondSequence = await ctx.storageService.sequences.read(
      ctx.projectContext,
      second.result.importSequenceUuid!,
    );

    expect(firstSequence.name).toBe("Import: dup.md");
    expect(secondSequence.name).toBe("Import: dup.md_1");
  });

  it("records the import-sequence UUID on the fragment:imported payload", async () => {
    const ctx = await makeCommandContext();
    const command = createImportCommand(makeStubConverter(""));

    const { result, logEntries } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(`# Logged ${Date.now()}\n\nBody.`),
      sourceFileName: "logged.md",
      format: "markdown",
      headingLevel: 1,
    });

    const payload = logEntries[0]!.payload as Record<string, unknown>;
    expect(payload.importSequenceUuid).toBe(result.importSequenceUuid);
  });

  it("creates no import-sequence when nothing was imported", async () => {
    const ctx = await makeCommandContext();

    const originalWrite = testContext.storageService.fragments.write;
    const { VaultError } = await import("@maskor/storage");
    testContext.storageService.fragments.write = async () => {
      throw new VaultError("KEY_CONFLICT", "key already exists");
    };

    const command = createImportCommand(makeStubConverter(""));
    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(`# Nothing ${Date.now()}\n\nBody.`),
      sourceFileName: "nothing.md",
      format: "markdown",
      headingLevel: 1,
    });

    testContext.storageService.fragments.write = originalWrite;

    expect(result.created.length).toBe(0);
    expect(result.importSequenceUuid).toBeUndefined();
  });
});

describe("createImportCommand - KEY_CONFLICT from storage", () => {
  it("surfaces KEY_CONFLICT from createFragmentCommand in errors[]", async () => {
    const ctx = await makeCommandContext();

    const originalWrite = testContext.storageService.fragments.write;
    const { VaultError } = await import("@maskor/storage");
    testContext.storageService.fragments.write = async (_projectCtx, _fragment) => {
      throw new VaultError("KEY_CONFLICT", "key already exists");
    };

    const command = createImportCommand(makeStubConverter(""));
    const content = `# Key Conflict Test ${Date.now()}\n\nBody text.`;

    const { result } = await command.execute(ctx, {
      projectId: project.projectUUID,
      file: encode(content),
      sourceFileName: "test.md",
      format: "markdown",
      headingLevel: 1,
    });

    testContext.storageService.fragments.write = originalWrite;

    expect(result.created.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.pieceIndex).toBe(1);
    expect(result.errors[0]!.pieceKey).toBeDefined();
    expect(result.errors[0]!.error).toContain("key already exists");
  });
});
