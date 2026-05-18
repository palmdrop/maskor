import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

type DraftResponse = {
  uuid: string;
  name: string;
  note?: string;
  createdAt: string;
  entityCounts: {
    fragments: number;
    aspects: number;
    notes: number;
    references: number;
    sequences: number;
  };
};

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
});

afterAll(() => {
  testContext.cleanup();
});

describe("POST /projects/:projectId/drafts", () => {
  it("creates a new draft and returns it", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "First snapshot", note: "for testing" }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as DraftResponse;
    expect(body.name).toBe("First snapshot");
    expect(body.note).toBe("for testing");
    expect(typeof body.uuid).toBe("string");
  });

  it("rejects duplicate names with 409", async () => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "first snapshot" }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("DRAFT_NAME_CONFLICT");
  });
});

describe("GET /projects/:projectId/drafts", () => {
  it("lists drafts in created-desc order", async () => {
    await testContext.app.request(`/projects/${project.projectUUID}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Second snapshot" }),
    });

    const response = await testContext.app.request(`/projects/${project.projectUUID}/drafts`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as DraftResponse[];
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body[0]?.name).toBe("Second snapshot");
  });
});

describe("DELETE /projects/:projectId/drafts/:draftId", () => {
  it("deletes a draft", async () => {
    const createResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/drafts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ephemeral" }),
      },
    );
    const created = (await createResponse.json()) as DraftResponse;

    const deleteResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/drafts/${created.uuid}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/drafts`,
    );
    const list = (await listResponse.json()) as DraftResponse[];
    expect(list.some((draft) => draft.uuid === created.uuid)).toBe(false);
  });

  it("returns 404 for an unknown draft uuid", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/drafts/00000000-0000-0000-0000-000000000000`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /projects/:projectId/drafts/:draftId/restore", () => {
  it("restores a draft and emits draft:created + draft:restored when saveCurrentFirst is on", async () => {
    const createResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/drafts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Restore target" }),
      },
    );
    const target = (await createResponse.json()) as DraftResponse;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/drafts/${target.uuid}/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveCurrentFirst: true }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      restoredDraftUuid: string;
      preRestoreDraftUuid?: string;
    };
    expect(body.restoredDraftUuid).toBe(target.uuid);
    expect(typeof body.preRestoreDraftUuid).toBe("string");

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    const log = (await logResponse.json()) as Array<{ type: string }>;
    const entries = log.map((entry) => entry.type);
    const restoredIndex = entries.indexOf("draft:restored");
    const createdIndex = entries.indexOf("draft:created");
    expect(restoredIndex).toBeGreaterThanOrEqual(0);
    expect(createdIndex).toBeGreaterThanOrEqual(0);
    // log returns most-recent-first, so draft:restored should appear before draft:created
    // for the pre-restore safety snapshot.
    expect(restoredIndex).toBeLessThan(createdIndex);
  });

  it("returns 404 for an unknown draft uuid", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/drafts/00000000-0000-0000-0000-000000000000/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveCurrentFirst: false }),
      },
    );
    expect(response.status).toBe(404);
  });
});
