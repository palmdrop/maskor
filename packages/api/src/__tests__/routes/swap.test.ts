import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

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

describe("PUT /projects/:projectId/swap/:entityType/:entityUUID", () => {
  it("writes a swap file and returns savedAt", async () => {
    const entityUUID = randomUUID();
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/fragment/${entityUUID}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "draft body" }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { savedAt: string };
    expect(typeof body.savedAt).toBe("string");
    expect(new Date(body.savedAt).toString()).not.toBe("Invalid Date");
  });

  it("rejects an unknown entity type with 400", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/invalid/${randomUUID()}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "x" }),
      },
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for a missing project", async () => {
    const fakeProject = randomUUID();
    const response = await testContext.app.request(
      `/projects/${fakeProject}/swap/fragment/${randomUUID()}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "x" }),
      },
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /projects/:projectId/swap/:entityType/:entityUUID", () => {
  it("returns the swap content when one exists", async () => {
    const entityUUID = randomUUID();
    await testContext.app.request(
      `/projects/${project.projectUUID}/swap/aspect/${entityUUID}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "aspect prose" }),
      },
    );

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/aspect/${entityUUID}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { content: string; savedAt: string };
    expect(body.content).toBe("aspect prose");
    expect(typeof body.savedAt).toBe("string");
  });

  it("returns 404 when no swap exists", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/note/${randomUUID()}`,
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /projects/:projectId/swap/:entityType/:entityUUID", () => {
  it("deletes an existing swap and returns 204", async () => {
    const entityUUID = randomUUID();
    await testContext.app.request(
      `/projects/${project.projectUUID}/swap/reference/${entityUUID}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "ref body" }),
      },
    );

    const deleteResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/reference/${entityUUID}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);

    const getResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/reference/${entityUUID}`,
    );
    expect(getResponse.status).toBe(404);
  });

  it("is idempotent — returns 204 for a non-existent swap", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/fragment/${randomUUID()}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(204);
  });
});
