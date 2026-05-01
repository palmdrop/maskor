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

describe("GET /projects/:projectId/notes", () => {
  it("returns indexed notes", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/notes`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as EntityShape[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((note) => note.key === "bridge observation")).toBe(true);
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

describe("POST /projects/:projectId/notes", () => {
  it("creates and returns a new note with 201", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "A test note", content: "Some content here." }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as EntityShape & { key: string };
    expect(body.uuid).toBeDefined();
    expect(body.key).toBe("A test note");
  });

  it("returns 400 when key is missing", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "No key here." }),
    });
    expect(response.status).toBe(400);
  });
});

describe("DELETE /projects/:projectId/notes/:noteId", () => {
  it("deletes a note and returns 204", async () => {
    const createResponse = await testContext.app.request(`/projects/${project.projectUUID}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "Note to delete", content: "Gone soon." }),
    });
    const created = (await createResponse.json()) as EntityShape;

    const deleteResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/${created.uuid}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("returns 404 for an unknown note UUID", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/00000000-0000-0000-0000-000000000000`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });
});
