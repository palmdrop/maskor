import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

type ApiProjectStats = {
  global: {
    totalCount: number;
    discardedCount: number;
    readyCount: number;
    averageReadyStatus: number;
    readyStatusHistogram: [number, number, number, number, number];
    totalWordCount: number;
    averageWordCount: number;
  };
  fragments: Array<{
    fragmentUuid: string;
    key: string;
    wordCount: number;
    updatedAt: string;
    readyStatus: number;
    isDiscarded: boolean;
  }>;
};

type ApiFragmentStats = {
  fragmentUuid: string;
  wordCount: number;
  editCount: number;
  voluntaryOpenCount: number;
  promptAcceptCount: number;
  avoidanceCount: number;
  lastSurfacedAt: string | null;
};

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

describe("GET /projects/:projectId/stats", () => {
  it("returns 200 with global and fragments fields", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/stats`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiProjectStats;
    expect(typeof body.global).toBe("object");
    expect(Array.isArray(body.fragments)).toBe(true);
  });

  it("global totalCount matches non-discarded fragment count", async () => {
    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as Array<{ isDiscarded: boolean }>;
    const nonDiscarded = fragments.filter((fragment) => !fragment.isDiscarded);

    const statsResponse = await testContext.app.request(`/projects/${project.projectUUID}/stats`);
    const body = (await statsResponse.json()) as ApiProjectStats;

    expect(body.global.totalCount).toBe(nonDiscarded.length);
  });

  it("readyStatusHistogram buckets sum to totalCount", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/stats`);
    const body = (await response.json()) as ApiProjectStats;
    const histogramSum = body.global.readyStatusHistogram.reduce((acc, count) => acc + count, 0);
    expect(histogramSum).toBe(body.global.totalCount);
  });

  it("fragments are sorted alphabetically by key", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/stats`);
    const body = (await response.json()) as ApiProjectStats;

    const keys = body.fragments.map((fragment) => fragment.key);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(sorted);
  });

  it("fragments list excludes discarded fragments", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/stats`);
    const body = (await response.json()) as ApiProjectStats;
    expect(body.fragments.every((fragment) => !fragment.isDiscarded)).toBe(true);
  });
});

describe("GET /projects/:projectId/fragments/:fragmentId/stats", () => {
  it("returns zeros for a fragment with no stats row", async () => {
    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as Array<{ uuid: string }>;
    const first = fragments[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${first.uuid}/stats`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiFragmentStats;
    expect(body.fragmentUuid).toBe(first.uuid);
    expect(typeof body.wordCount).toBe("number");
    expect(typeof body.editCount).toBe("number");
    expect(typeof body.voluntaryOpenCount).toBe("number");
    expect(typeof body.promptAcceptCount).toBe("number");
    expect(typeof body.avoidanceCount).toBe("number");
  });

  it("wordCount updates after fragment content is saved", async () => {
    const createResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "stats-word-count-test", content: "one two three" }),
      },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { uuid: string };

    await testContext.app.request(`/projects/${project.projectUUID}/fragments/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "alpha beta gamma delta epsilon" }),
    });

    const statsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${created.uuid}/stats`,
    );
    const stats = (await statsResponse.json()) as ApiFragmentStats;
    expect(stats.wordCount).toBe(5);
  });
});

describe("GET /projects/:projectId/stats — empty project", () => {
  it("returns empty fragments list when project has no fragments", async () => {
    const { mkdirSync } = await import("node:fs");

    // Use a blank directory with no fragment files so the rebuild finds nothing.
    const emptyVaultDirectory = `${testContext.temporaryDirectory}/blank-vault`;
    mkdirSync(emptyVaultDirectory, { recursive: true });
    const emptyProject = await testContext.storageService.registerProject(
      "Empty Project",
      emptyVaultDirectory,
    );

    const response = await testContext.app.request(`/projects/${emptyProject.projectUUID}/stats`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiProjectStats;
    expect(body.fragments).toHaveLength(0);
    expect(body.global.totalCount).toBe(0);
  });
});
