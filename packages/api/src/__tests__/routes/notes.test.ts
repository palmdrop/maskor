import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

type EntityShape = { uuid: string };

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

describe("GET /projects/:projectId/notes", () => {
  it("returns indexed notes", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/notes`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as EntityShape[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("GET /projects/:projectId/notes/:noteId", () => {
  it("returns a single note by UUID", async () => {
    const listResponse = await testContext.app.request(`/projects/${project.projectUUID}/notes`);
    const notes = (await listResponse.json()) as EntityShape[];
    const first = notes[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/${first.uuid}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as EntityShape;
    expect(body.uuid).toBe(first.uuid);
  });

  it("returns 404 for an unknown note UUID", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status).toBe(404);
  });
});
