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

afterAll(async () => {
  await testContext.cleanup();
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
    await testContext.app.request(`/projects/${project.projectUUID}/swap/aspect/${entityUUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "aspect prose" }),
    });

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/aspect/${entityUUID}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { content: string | null; savedAt: string | null };
    expect(body.content).toBe("aspect prose");
    expect(typeof body.savedAt).toBe("string");
  });

  it("returns 200 with null fields when no swap exists", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/note/${randomUUID()}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      content: string | null;
      savedAt: string | null;
      baseHash: string | null;
    };
    expect(body.content).toBeNull();
    expect(body.savedAt).toBeNull();
    expect(body.baseHash).toBeNull();
  });

  it("round-trips the baseline fingerprint written with the swap (multi-tab-swap-hardening)", async () => {
    const entityUUID = randomUUID();
    await testContext.app.request(`/projects/${project.projectUUID}/swap/fragment/${entityUUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "buffered edits", baseHash: "server-v1-fingerprint" }),
    });

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/fragment/${entityUUID}`,
    );
    const body = (await response.json()) as { content: string | null; baseHash: string | null };
    expect(body.content).toBe("buffered edits");
    expect(body.baseHash).toBe("server-v1-fingerprint");
  });

  it("returns baseHash null for a swap written without a baseline (legacy-compatible)", async () => {
    const entityUUID = randomUUID();
    await testContext.app.request(`/projects/${project.projectUUID}/swap/fragment/${entityUUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "no baseline" }),
    });

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/fragment/${entityUUID}`,
    );
    const body = (await response.json()) as { content: string | null; baseHash: string | null };
    expect(body.content).toBe("no baseline");
    expect(body.baseHash).toBeNull();
  });
});

describe("GET /projects/:projectId/swap", () => {
  it("lists entities that currently have a swap file", async () => {
    const fragmentUUID = randomUUID();
    await testContext.app.request(
      `/projects/${project.projectUUID}/swap/fragment/${fragmentUUID}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "unsaved fragment body" }),
      },
    );

    const response = await testContext.app.request(`/projects/${project.projectUUID}/swap`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entries: Array<{ entityType: string; entityUUID: string; savedAt: string }>;
    };
    const match = body.entries.find((entry) => entry.entityUUID === fragmentUUID);
    expect(match).toBeDefined();
    expect(match!.entityType).toBe("fragment");
    expect(typeof match!.savedAt).toBe("string");
  });

  it("does not list an entity whose swap was deleted", async () => {
    const fragmentUUID = randomUUID();
    await testContext.app.request(
      `/projects/${project.projectUUID}/swap/fragment/${fragmentUUID}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "temporary" }),
      },
    );
    await testContext.app.request(
      `/projects/${project.projectUUID}/swap/fragment/${fragmentUUID}`,
      { method: "DELETE" },
    );

    const response = await testContext.app.request(`/projects/${project.projectUUID}/swap`);
    const body = (await response.json()) as {
      entries: Array<{ entityUUID: string }>;
    };
    expect(body.entries.some((entry) => entry.entityUUID === fragmentUUID)).toBe(false);
  });
});

describe("DELETE /projects/:projectId/swap/:entityType/:entityUUID", () => {
  it("deletes an existing swap and returns 204", async () => {
    const entityUUID = randomUUID();
    await testContext.app.request(`/projects/${project.projectUUID}/swap/reference/${entityUUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "ref body" }),
    });

    const deleteResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/reference/${entityUUID}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);

    const getResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/reference/${entityUUID}`,
    );
    expect(getResponse.status).toBe(200);
    const body = (await getResponse.json()) as { content: string | null };
    expect(body.content).toBeNull();
  });

  it("is idempotent — returns 204 for a non-existent swap", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/swap/fragment/${randomUUID()}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(204);
  });
});
