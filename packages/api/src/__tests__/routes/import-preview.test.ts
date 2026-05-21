import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { PreviewImportResult } from "../../commands/fragments/preview-import";

type ApiError = { error: string; message: string };

const docxFixturePath = join(
  import.meta.dir,
  "../../../../importer/src/__tests__/fixtures/sample.docx",
);

const makePreviewRequest = (
  app: ReturnType<typeof createTestApp>["app"],
  projectUUID: string,
  file: File,
  options: object,
): Promise<Response> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("options", JSON.stringify(options));
  return Promise.resolve(
    app.request(`/projects/${projectUUID}/import/preview`, {
      method: "POST",
      body: formData,
    }),
  );
};

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
});

afterAll(() => {
  testContext.cleanup();
});

describe("POST /projects/:projectId/import/preview — markdown", () => {
  it("returns preview pieces for a markdown file", async () => {
    const content = "# First\n\nContent of first.\n\n# Second\n\nContent of second.";
    const file = new File([content], "test.md", { type: "text/markdown" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 1,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewImportResult;
    expect(body.pieces).toHaveLength(2);
    expect(body.format).toBe("markdown");
    expect(body.convertedMarkdown).toBe(content);
    expect(body.pieces[0]?.pieceIndex).toBe(1);
    expect(body.pieces[1]?.pieceIndex).toBe(2);
    body.pieces.forEach((p) => expect(typeof p.derivedKey).toBe("string"));
  });

  it("respects heading level option", async () => {
    const content = "# H1\n\nH1 content.\n\n## H2\n\nH2 content.";
    const file = new File([content], "test.md", { type: "text/markdown" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 2,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewImportResult;
    expect(body.pieces).toHaveLength(2);
  });
});

describe("POST /projects/:projectId/import/preview — plaintext", () => {
  it("returns preview pieces split by delimiter", async () => {
    const content = "First piece of content.\n---\nSecond piece.\n---\nThird piece.";
    const file = new File([content], "test.txt", { type: "text/plain" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "plaintext",
      delimiter: "---",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewImportResult;
    expect(body.pieces).toHaveLength(3);
    expect(body.format).toBe("plaintext");
  });
});

describe("POST /projects/:projectId/import/preview — docx", () => {
  it("previews a docx file by converting and splitting on headings", async () => {
    let docxBytes: Uint8Array;
    try {
      docxBytes = new Uint8Array(readFileSync(docxFixturePath));
    } catch {
      console.warn("docx fixture not found at expected path, skipping docx test");
      return;
    }

    const file = new File([docxBytes], "sample.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "docx",
      headingLevel: 1,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewImportResult;
    expect(body.pieces.length).toBeGreaterThan(0);
    expect(body.format).toBe("docx");
    expect(typeof body.convertedMarkdown).toBe("string");
  });
});

describe("POST /projects/:projectId/import/preview — key collision", () => {
  it("returns suffixed key when fragment already exists with that key", async () => {
    const uniqueKey = `preview-collision-${Date.now()}`;
    await testContext.app.request(`/projects/${project.projectUUID}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: uniqueKey, content: "existing" }),
    });

    const content = `# ${uniqueKey}\n\nNew body here.`;
    const file = new File([content], "test.md", { type: "text/markdown" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 1,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewImportResult;
    expect(body.pieces).toHaveLength(1);
    expect(body.pieces[0]?.derivedKey).toMatch(/_1$/);
  });
});

describe("POST /projects/:projectId/import/preview — zero-piece case", () => {
  it("returns empty pieces array when document has no matchable sections", async () => {
    const content = "# Heading Only\n\n";
    const file = new File([content], "test.md", { type: "text/markdown" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 1,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewImportResult;
    expect(body.pieces).toHaveLength(0);
    expect(body.convertedMarkdown).toBe(content);
  });
});

describe("POST /projects/:projectId/import/preview — invalid options", () => {
  it("returns 400 for invalid options JSON", async () => {
    const formData = new FormData();
    formData.append("file", new File(["content"], "test.md"));
    formData.append("options", "not-valid-json{{{");

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/import/preview`,
      { method: "POST", body: formData },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiError;
    expect(body.error).toBeDefined();
  });

  it("returns 400 for options with unknown format", async () => {
    const formData = new FormData();
    formData.append("file", new File(["content"], "test.md"));
    formData.append("options", JSON.stringify({ format: "pdf" }));

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/import/preview`,
      { method: "POST", body: formData },
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when markdown format is missing headingLevel", async () => {
    const formData = new FormData();
    formData.append("file", new File(["# Hello\n\nContent."], "test.md"));
    formData.append("options", JSON.stringify({ format: "markdown" }));

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/import/preview`,
      { method: "POST", body: formData },
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /projects/:projectId/import/preview — corrupt docx", () => {
  it("returns 500 with usable error message for a corrupt docx file", async () => {
    const corruptBytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const file = new File([corruptBytes], "corrupt.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "docx",
      headingLevel: 1,
    });

    expect(response.status).toBe(500);
    const body = (await response.json()) as ApiError;
    expect(body.error).toBeDefined();
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });
});
