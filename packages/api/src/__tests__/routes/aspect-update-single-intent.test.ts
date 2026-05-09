import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { IndexedAspect } from "@maskor/storage";

type LogEntry = {
  id: string;
  type: string;
  timestamp: string;
  target: { uuid: string; key?: string };
  payload: Record<string, unknown>;
};

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

const findAspectByKey = async (key: string): Promise<IndexedAspect> => {
  const context = await testContext.storageService.resolveProject(project.projectUUID);
  const all = await testContext.storageService.aspects.readAll(context);
  const match = all.find((aspect) => aspect.key === key);
  if (!match) throw new Error(`Aspect "${key}" not found`);
  return match;
};

const tailEntries = async (limit = 20): Promise<LogEntry[]> => {
  const response = await testContext.app.request(
    `/projects/${project.projectUUID}/action-log?limit=${limit}`,
  );
  return (await response.json()) as LogEntry[];
};

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
});

afterAll(() => {
  testContext.cleanup();
});

describe("PATCH /aspects/:aspectId — single-intent action types", () => {
  it("emits 'aspect:description-edited' for a description-only save", async () => {
    const aspect = await findAspectByKey("time");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated description text." }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const entry = entries.find(
      (e) => e.type === "aspect:description-edited" && e.target.uuid === aspect.uuid,
    );
    expect(entry).toBeTruthy();
  });

  it("emits 'aspect:updated' catch-all when description changes via programmatic patch", async () => {
    const aspect = await findAspectByKey("memory");
    // Description + category in same patch → programmatic → aspect:updated
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Changed desc.", category: "test-category" }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const descEdited = entries.find(
      (e) => e.type === "aspect:description-edited" && e.target.uuid === aspect.uuid,
    );
    // Should NOT produce aspect:description-edited — mixed patch is programmatic
    expect(descEdited).toBeUndefined();
    // Should produce aspect:updated AND aspect:category-changed
    const updated = entries.find(
      (e) => e.type === "aspect:updated" && e.target.uuid === aspect.uuid,
    );
    expect(updated).toBeTruthy();
  });

  it("emits 'aspect:category-changed' with from/to when category changes", async () => {
    const aspect = await findAspectByKey("grief");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "emotional" }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const entry = entries.find(
      (e) => e.type === "aspect:category-changed" && e.target.uuid === aspect.uuid,
    );
    expect(entry).toBeTruthy();
    expect(entry?.payload.to).toBe("emotional");
  });

  it("emits 'aspect:note-attached' when a note is added to an aspect", async () => {
    const aspect = await findAspectByKey("city");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: ["bridge observation"] }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const entry = entries.find(
      (e) => e.type === "aspect:note-attached" && e.target.uuid === aspect.uuid,
    );
    expect(entry).toBeTruthy();
    expect(entry?.payload.noteKey).toBe("bridge observation");
  });
});
