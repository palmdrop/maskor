import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { IndexedFragment } from "@maskor/storage";

type ApiError = { error: string; message: string; hint?: string };

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;
let vaultDirectory: string;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
  vaultDirectory = seeded.vaultDirectory;
});

afterAll(() => {
  testContext.cleanup();
});

describe("GET /projects/:projectId/fragments", () => {
  it("returns all indexed fragments", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/fragments`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as IndexedFragment[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(5);
  });

  it("returns fragments with isDiscarded field", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/fragments`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as IndexedFragment[];
    expect(Array.isArray(body)).toBe(true);
    body.forEach((fragment) => {
      expect(typeof fragment.isDiscarded).toBe("boolean");
    });
  });
});

describe("GET /projects/:projectId/fragments/:fragmentId", () => {
  it("returns a single fragment by UUID", async () => {
    const listResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const first = fragments[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${first.uuid}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as IndexedFragment;
    expect(body.uuid).toBe(first.uuid);
  });

  it("returns 404 for an unknown fragment UUID", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 with stale index hint when the file is deleted after indexing", async () => {
    // Write a fragment via API, then rebuild so it's indexed
    const writeResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Stale Deletion Test",
          content: "This file will be deleted.",
        }),
      },
    );
    const { uuid } = (await writeResponse.json()) as { uuid: string };

    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    // Delete the underlying file directly, bypassing the service
    unlinkSync(join(vaultDirectory, "fragments", "stale-deletion-test.md"));

    const getResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${uuid}`,
    );
    expect(getResponse.status).toBe(503);
    const body = (await getResponse.json()) as ApiError;
    expect(body.hint).toBe("index_may_be_stale");
  });
});

describe("POST /projects/:projectId/fragments", () => {
  it("writes a fragment and returns 201 with the created entity", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Fragment",
        content: "Some content here.",
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as IndexedFragment;
    expect(body.uuid).toBeDefined();
    expect(body.title).toBe("Test Fragment");
    expect(body.isDiscarded).toBe(false);
  });

  it("returns 400 when required fields are missing", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Missing content" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("DELETE /projects/:projectId/fragments/:fragmentId", () => {
  it("discards a fragment and returns 204", async () => {
    const listResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const active = fragments.filter((fragment) => !fragment.isDiscarded);
    expect(active.length).toBeGreaterThan(0);
    const target = active[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${target.uuid}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(204);
  });

  it("returns 404 for an unknown fragment UUID", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/00000000-0000-0000-0000-000000000000`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });
});
