import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createVaultDatabase, insertWarning } from "@maskor/storage";
import type { ProjectRecord } from "@maskor/storage";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;
let vaultDirectory: string;

beforeEach(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
  vaultDirectory = seeded.vaultDirectory;
});

afterEach(() => {
  testContext.cleanup();
});

type WarningResponse = {
  id: string;
  kind: string;
  category: string;
  createdAt: string;
};

describe("GET /projects/:projectId/warnings", () => {
  it("returns an empty list for a clean vault", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/warnings`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("lists a WRONG_FORMAT_FILE state warning after a rebuild detects a non-.md file", async () => {
    writeFileSync(join(vaultDirectory, "fragments", "imported.docx"), "binary");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const response = await testContext.app.request(`/projects/${project.projectUUID}/warnings`);
    expect(response.status).toBe(200);
    const warnings = (await response.json()) as WarningResponse[];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      kind: "WRONG_FORMAT_FILE",
      category: "state",
      filePath: "fragments/imported.docx",
    });
    expect(typeof warnings[0]!.createdAt).toBe("string");
  });

  it("returns 404 for an unknown project", async () => {
    const response = await testContext.app.request(
      `/projects/00000000-0000-0000-0000-000000000000/warnings`,
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /projects/:projectId/warnings/:id/dismiss", () => {
  const seedEventWarning = (): void => {
    const vaultDatabase = createVaultDatabase(vaultDirectory);
    insertWarning(vaultDatabase, {
      kind: "UUID_COLLISION",
      filePath: "fragments/duplicate.md",
      collidingPath: "fragments/original.md",
      newUuid: "11111111-1111-1111-1111-111111111111",
    });
  };

  it("dismisses an event warning and returns the remaining warnings", async () => {
    seedEventWarning();

    const listResponse = await testContext.app.request(`/projects/${project.projectUUID}/warnings`);
    const warnings = (await listResponse.json()) as WarningResponse[];
    expect(warnings).toHaveLength(1);
    const { id } = warnings[0]!;

    const dismissResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/warnings/${id}/dismiss`,
      { method: "POST" },
    );
    expect(dismissResponse.status).toBe(200);
    expect(await dismissResponse.json()).toEqual([]);

    const afterResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/warnings`,
    );
    expect(await afterResponse.json()).toEqual([]);
  });

  it("rejects dismissing a state warning with 400", async () => {
    writeFileSync(join(vaultDirectory, "fragments", "imported.docx"), "binary");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const listResponse = await testContext.app.request(`/projects/${project.projectUUID}/warnings`);
    const warnings = (await listResponse.json()) as WarningResponse[];
    const { id } = warnings[0]!;

    const dismissResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/warnings/${id}/dismiss`,
      { method: "POST" },
    );
    expect(dismissResponse.status).toBe(400);

    // The state warning is still present after the rejected dismiss.
    const afterResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/warnings`,
    );
    expect((await afterResponse.json()) as WarningResponse[]).toHaveLength(1);
  });

  it("returns 404 dismissing an unknown warning id", async () => {
    const dismissResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/warnings/nonexistent/dismiss`,
      { method: "POST" },
    );
    expect(dismissResponse.status).toBe(404);
  });
});
