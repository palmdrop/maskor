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

describe("POST /projects/:projectId/notes/extract", () => {
  it("creates a note from selection and returns 201", async () => {
    const fragmentListResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentListResponse.json()) as { uuid: string; key: string }[];
    const sourceFragment = fragments[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/extract`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "extracted-note",
          content: "The mist settled over the harbour.",
          sourceUuid: sourceFragment.uuid,
          sourceType: "fragment",
          sourceMode: "keep",
          navigated: true,
        }),
      },
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { uuid: string; key: string; content: string };
    expect(body.uuid).toBeDefined();
    expect(body.key).toBe("extracted-note");
    expect(body.content).toBe("The mist settled over the harbour.");
  });

  it("returns 400 for an invalid key", async () => {
    const fragmentListResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentListResponse.json()) as { uuid: string }[];
    const sourceFragment = fragments[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/extract`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "bad/key!",
          content: "Some content.",
          sourceUuid: sourceFragment.uuid,
          sourceType: "fragment",
          sourceMode: "keep",
          navigated: false,
        }),
      },
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 when source UUID does not exist", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/extract`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "note-from-ghost",
          content: "Some content.",
          sourceUuid: "00000000-0000-0000-0000-000000000000",
          sourceType: "fragment",
          sourceMode: "keep",
          navigated: false,
        }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("allows a note key that is already used by a fragment (cross-type keys do not collide)", async () => {
    const fragmentListResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentListResponse.json()) as { uuid: string; key: string }[];
    const sourceFragment = fragments[0]!;

    const crossKeyResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/extract`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: sourceFragment.key,
          content: "Reusing a fragment key for a note.",
          sourceUuid: sourceFragment.uuid,
          sourceType: "fragment",
          sourceMode: "keep",
          navigated: false,
        }),
      },
    );
    expect(crossKeyResponse.status).toBe(201);
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
