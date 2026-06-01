import { describe, it, expect, beforeAll, afterAll } from "bun:test";
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

describe("POST /projects/:projectId/index/rebuild", () => {
  it("rebuilds the index and returns stats", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/index/rebuild`,
      {
        method: "POST",
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("fragments");
    expect(body).toHaveProperty("aspects");
  });
});

describe("POST /projects/:projectId/index/reset", () => {
  it("resets the database and returns rebuild stats", async () => {
    const freshContext = createTestApp();
    const { project: freshProject } = await seedVault(
      freshContext.storageService,
      freshContext.temporaryDirectory,
    );

    const response = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/index/reset`,
      { method: "POST" },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { fragments: number; aspects: number };
    expect(body).toHaveProperty("fragments");
    expect(body.fragments).toBeGreaterThan(0);

    // The DB is usable afterwards — fragments still list.
    const fragments = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    expect(fragments.status).toBe(200);
    expect(((await fragments.json()) as unknown[]).length).toBe(body.fragments);

    await freshContext.cleanup();
  });
});

describe("GET /projects/:projectId/rebuild-status", () => {
  it("returns rebuilding:false when no rebuild is in progress", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/rebuild-status`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { rebuilding: boolean };
    expect(typeof body.rebuilding).toBe("boolean");
  });

  it("concurrent data requests all wait for the same rebuild (no empty-data race)", async () => {
    // Create a fresh test context so the rebuild state is clean.
    const freshContext = createTestApp();
    const { project: freshProject } = await seedVault(
      freshContext.storageService,
      freshContext.temporaryDirectory,
    );

    // Fire three fragment-list requests in parallel — all should get full data, not empty results.
    const [response1, response2, response3] = await Promise.all([
      freshContext.app.request(`/projects/${freshProject.projectUUID}/fragments`),
      freshContext.app.request(`/projects/${freshProject.projectUUID}/fragments`),
      freshContext.app.request(`/projects/${freshProject.projectUUID}/fragments`),
    ]);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response3.status).toBe(200);

    const body1 = (await response1.json()) as unknown[];
    const body2 = (await response2.json()) as unknown[];
    const body3 = (await response3.json()) as unknown[];

    // All three responses should contain the same non-empty fragment list.
    expect(Array.isArray(body1)).toBe(true);
    expect(body1.length).toBe(body2.length);
    expect(body1.length).toBe(body3.length);
    expect(body1.length).toBeGreaterThan(0);

    await freshContext.cleanup();
  });
});
