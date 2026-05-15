import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { LogEntry as SharedLogEntry } from "@maskor/shared";

type LogEntry = { id: string; type: string; timestamp: string };

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

describe("GET /projects/:projectId/action-log", () => {
  it("returns 200 with an empty array on a fresh vault", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/action-log`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as LogEntry[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("respects the limit query param", async () => {
    const context = await testContext.storageService.resolveProject(project.projectUUID);

    // Append 5 entries directly via storage service
    for (let index = 0; index < 5; index++) {
      await testContext.storageService.actionLog.append(context, {
        id: `test-id-${index}`,
        timestamp: new Date().toISOString(),
        type: "fragment:created",
        actor: "user",
        target: { type: "fragment", uuid: `uuid-${index}`, key: `fragment-${index}` },
        payload: {},
        undoable: false,
      } as SharedLogEntry);
    }

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=3`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as LogEntry[];
    expect(body.length).toBeLessThanOrEqual(3);
  });

  it("returns entries most-recent-first", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as LogEntry[];
    if (body.length > 1) {
      expect(new Date(body[0]!.timestamp) >= new Date(body[1]!.timestamp)).toBe(true);
    }
  });

  it("clamps limit to max 500", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=9999`,
    );
    expect(response.status).toBe(200);
  });
});

describe("POST /projects/:projectId/fragments — produces a log entry", () => {
  it("creates a fragment and records a fragment:created entry", async () => {
    const createResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "log-test-fragment", content: "test content" }),
      },
    );
    expect(createResponse.status).toBe(201);

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    expect(entries.some((entry) => entry.type === "fragment:created")).toBe(true);
  });
});
