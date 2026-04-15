import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

type EntityShape = { uuid: string; name?: string };

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

describe("GET /projects/:projectId/references", () => {
  it("returns indexed references", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/references`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as EntityShape[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((reference) => reference.name === "city research")).toBe(true);
  });
});

describe("GET /projects/:projectId/references/:referenceId", () => {
  it("returns a single reference by UUID", async () => {
    const listResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/references`,
    );
    const references = (await listResponse.json()) as EntityShape[];
    const first = references[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/references/${first.uuid}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as EntityShape;
    expect(body.uuid).toBe(first.uuid);
  });

  it("returns 404 for an unknown reference UUID", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/references/00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /projects/:projectId/references", () => {
  it("creates and returns a new reference with 201", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/references`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Blood Meridian", content: "McCarthy. The Judge. Violence." }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as EntityShape & { name: string };
    expect(body.uuid).toBeDefined();
    expect(body.name).toBe("Blood Meridian");
  });

  it("returns 400 when name is missing", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/references`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "No name here." }),
    });
    expect(response.status).toBe(400);
  });
});

describe("DELETE /projects/:projectId/references/:referenceId", () => {
  it("deletes a reference and returns 204", async () => {
    const createResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/references`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Reference to delete", content: "Gone soon." }),
      },
    );
    const created = (await createResponse.json()) as EntityShape;

    const deleteResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/references/${created.uuid}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("returns 404 for an unknown reference UUID", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/references/00000000-0000-0000-0000-000000000000`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });
});
