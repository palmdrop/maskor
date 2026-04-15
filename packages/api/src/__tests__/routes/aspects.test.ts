import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

type EntityShape = { uuid: string; key?: string };

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

describe("GET /projects/:projectId/aspects", () => {
  it("returns indexed aspects", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/aspects`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as EntityShape[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((aspect) => aspect.key === "city")).toBe(true);
  });
});

describe("GET /projects/:projectId/aspects/:aspectId", () => {
  it("returns a single aspect by UUID", async () => {
    const listResponse = await testContext.app.request(`/projects/${project.projectUUID}/aspects`);
    const aspects = (await listResponse.json()) as EntityShape[];
    const first = aspects[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${first.uuid}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as EntityShape;
    expect(body.uuid).toBe(first.uuid);
  });

  it("returns 404 for an unknown aspect UUID", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /projects/:projectId/aspects", () => {
  it("creates and returns a new aspect with 201", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/aspects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "pacing", category: "style", notes: [] }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as EntityShape & { key: string };
    expect(body.uuid).toBeDefined();
    expect(body.key).toBe("pacing");
  });

  it("returns 400 when key is missing", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/aspects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "style" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("DELETE /projects/:projectId/aspects/:aspectId", () => {
  it("deletes an aspect and returns 204", async () => {
    const createResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "to-delete-aspect", notes: [] }),
      },
    );
    const created = (await createResponse.json()) as EntityShape;

    const deleteResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${created.uuid}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("returns 404 for an unknown aspect UUID", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/00000000-0000-0000-0000-000000000000`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });
});
