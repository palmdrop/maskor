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

afterAll(() => {
  testContext.cleanup();
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
