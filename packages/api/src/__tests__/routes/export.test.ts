import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;
let mainSequenceUuid: string;
let vaultDirectory: string;

const exportUrl = (sequenceId: string) => `/projects/${project.projectUUID}/export/${sequenceId}`;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
  vaultDirectory = seeded.vaultDirectory;

  const mainResp = await testContext.app.request(`/projects/${project.projectUUID}/sequences/main`);
  const mainSeq = (await mainResp.json()) as { uuid: string };
  mainSequenceUuid = mainSeq.uuid;
});

afterAll(async () => {
  await testContext.cleanup();
});

describe("POST /projects/:projectId/export/:sequenceId", () => {
  it("returns 200 with Content-Disposition for md format", async () => {
    const response = await testContext.app.request(exportUrl(mainSequenceUuid), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "md" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const disposition = response.headers.get("content-disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toContain(".md");
  });

  it("returns 200 with utf-8 bytes for txt format", async () => {
    const response = await testContext.app.request(exportUrl(mainSequenceUuid), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "txt" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const disposition = response.headers.get("content-disposition");
    expect(disposition).toContain(".txt");
  });

  it("returns 200 with a valid docx zip for docx format", async () => {
    const response = await testContext.app.request(exportUrl(mainSequenceUuid), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "docx" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const disposition = response.headers.get("content-disposition");
    expect(disposition).toContain(".docx");

    const bytes = new Uint8Array(await response.arrayBuffer());
    // docx is a zip — begins with PK magic bytes
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("archives the exported file to .maskor/exports/ in the vault", async () => {
    const { Glob } = await import("bun");
    const response = await testContext.app.request(exportUrl(mainSequenceUuid), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "md" }),
    });

    expect(response.status).toBe(200);

    const exportsDir = `${vaultDirectory}/.maskor/exports`;
    const files = [...new Glob("*.md").scanSync({ cwd: exportsDir, absolute: true })];
    expect(files.length).toBeGreaterThan(0);
  });

  it("returns 404 for a nonexistent sequence", async () => {
    const response = await testContext.app.request(
      exportUrl("00000000-0000-0000-0000-000000000000"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "md" }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for an invalid format", async () => {
    const response = await testContext.app.request(exportUrl(mainSequenceUuid), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "pdf" }),
    });

    expect(response.status).toBe(400);
  });
});
