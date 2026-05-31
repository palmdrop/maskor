import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { anchorSentinel } from "@maskor/shared/sentinel";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

type ApiError = { error: string; message: string };
type PreviewNavFragment = { uuid: string; key: string };
type PreviewNavSection = { uuid: string; name: string; fragments: PreviewNavFragment[] };
type PreviewResult = { markdown: string; sections: PreviewNavSection[] };

const pieceNav = (body: PreviewResult): PreviewNavFragment[] =>
  body.sections.flatMap((section) => section.fragments);

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

afterAll(async () => {
  await testContext.cleanup();
});

describe("POST /projects/:projectId/import/preview — markdown", () => {
  it("returns markdown + single-section nav with one entry per piece", async () => {
    const content = "# First\n\nContent of first.\n\n# Second\n\nContent of second.";
    const file = new File([content], "test.md", { type: "text/markdown" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 1,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewResult;
    expect(body.sections).toHaveLength(1);
    const nav = pieceNav(body);
    expect(nav).toHaveLength(2);
    // Anchor ids are piece indices; titles drive the markdown headings.
    expect(nav.map((f) => f.uuid)).toEqual(["1", "2"]);
    expect(body.markdown).toContain("### 1. ");
    expect(body.markdown).toContain("### 2. ");
    expect(body.markdown).toContain("Content of first.");
    expect(body.markdown).toContain("Content of second.");
  });

  it("embeds a per-piece anchor sentinel encoding the piece index", async () => {
    const content = "# Only\n\nBody here.";
    const file = new File([content], "test.md", { type: "text/markdown" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 1,
    });

    const body = (await response.json()) as PreviewResult;
    const nav = pieceNav(body);
    expect(nav).toHaveLength(1);
    // The sentinel carries the piece index "1", matching the nav uuid.
    expect(body.markdown).toContain(nav[0]!.uuid);
    // The anchor sits immediately before the piece's ### heading, so sidebar
    // navigation lands on the title rather than the body below it.
    expect(body.markdown).toContain(`${anchorSentinel(nav[0]!.uuid)}\n\n### `);
  });

  it("reflects heading-level changes in the nav", async () => {
    const content = "# H1\n\nH1 content.\n\n## H2\n\nH2 content.";
    const file = new File([content], "test.md", { type: "text/markdown" });

    const atLevelOne = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 1,
    });
    const atLevelTwo = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 2,
    });

    expect(pieceNav((await atLevelOne.json()) as PreviewResult)).toHaveLength(1);
    expect(pieceNav((await atLevelTwo.json()) as PreviewResult)).toHaveLength(2);
  });
});

describe("POST /projects/:projectId/import/preview — plaintext", () => {
  it("reflects delimiter splits in the nav", async () => {
    const content = "First piece of content.\n---\nSecond piece.\n---\nThird piece.";
    const file = new File([content], "test.txt", { type: "text/plain" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "plaintext",
      delimiter: "---",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewResult;
    expect(pieceNav(body)).toHaveLength(3);
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
    const body = (await response.json()) as PreviewResult;
    expect(pieceNav(body).length).toBeGreaterThan(0);
    expect(typeof body.markdown).toBe("string");
  });
});

describe("POST /projects/:projectId/import/preview — key collision", () => {
  it("returns suffixed key in the nav when a fragment already exists with that key", async () => {
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
    const body = (await response.json()) as PreviewResult;
    const nav = pieceNav(body);
    expect(nav).toHaveLength(1);
    expect(nav[0]?.key).toMatch(/_1$/);
  });
});

describe("POST /projects/:projectId/import/preview — zero-piece case", () => {
  it("returns empty markdown and an empty nav when no sections match", async () => {
    const content = "# Heading Only\n\n";
    const file = new File([content], "test.md", { type: "text/markdown" });

    const response = await makePreviewRequest(testContext.app, project.projectUUID, file, {
      format: "markdown",
      headingLevel: 1,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewResult;
    expect(pieceNav(body)).toHaveLength(0);
    expect(body.markdown).toBe("");
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
