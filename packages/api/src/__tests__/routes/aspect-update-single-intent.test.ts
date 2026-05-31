import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { IndexedAspect } from "@maskor/storage";
import type { Aspect } from "@maskor/shared";

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

const readFullAspect = async (indexed: IndexedAspect): Promise<Aspect> => {
  const context = await testContext.storageService.resolveProject(project.projectUUID);
  return testContext.storageService.aspects.read(context, indexed.uuid);
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

afterAll(async () => {
  await testContext.cleanup();
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
    // Description + notes in same patch → programmatic → aspect:updated
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Changed desc.", notes: ["scratch"] }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const descEdited = entries.find(
      (e) => e.type === "aspect:description-edited" && e.target.uuid === aspect.uuid,
    );
    // Should NOT produce aspect:description-edited — mixed patch is programmatic
    expect(descEdited).toBeUndefined();
    // Should produce aspect:updated alongside the note-attached entry
    const updated = entries.find(
      (e) => e.type === "aspect:updated" && e.target.uuid === aspect.uuid,
    );
    expect(updated).toBeTruthy();
  });

  it("emits 'aspect:category-changed' with from/to and relocates the file when category is patched", async () => {
    const aspect = await findAspectByKey("grief");
    const projectContext = await testContext.storageService.resolveProject(project.projectUUID);
    const indexedBefore = await testContext.storageService.aspects.readAll(projectContext);
    const griefBefore = indexedBefore.find((a) => a.uuid === aspect.uuid)!;
    expect(griefBefore.filePath).toBe("theme/grief.md");

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "themes-v2" }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const entry = entries.find(
      (e) => e.type === "aspect:category-changed" && e.target.uuid === aspect.uuid,
    );
    expect(entry).toBeTruthy();
    expect(entry?.payload.from).toBe("theme");
    expect(entry?.payload.to).toBe("themes-v2");

    const indexedAfter = await testContext.storageService.aspects.readAll(projectContext);
    const griefAfter = indexedAfter.find((a) => a.uuid === aspect.uuid)!;
    expect(griefAfter.filePath).toBe("themes-v2/grief.md");
    expect(griefAfter.category).toBe("themes-v2");
  });

  it("clears the category (moves to root) when patched with null", async () => {
    const aspect = await findAspectByKey("memory");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: null }),
      },
    );
    expect(response.status).toBe(200);

    const projectContext = await testContext.storageService.resolveProject(project.projectUUID);
    const indexedAfter = await testContext.storageService.aspects.readAll(projectContext);
    const memoryAfter = indexedAfter.find((a) => a.uuid === aspect.uuid)!;
    expect(memoryAfter.filePath).toBe("memory.md");
    expect(memoryAfter.category).toBeUndefined();
  });

  it("rejects an invalid category path with 400", async () => {
    const aspect = await findAspectByKey("city");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "themes/../escape" }),
      },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("INVALID_CATEGORY");
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

describe("PATCH /aspects/:aspectId — color field", () => {
  it("sets a color and emits aspect:updated with changedFields: [color]", async () => {
    const aspect = await findAspectByKey("city");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: "#3b82f6" }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { aspect: { color?: string } };
    expect(body.aspect.color).toBe("#3b82f6");

    const entries = await tailEntries();
    const entry = entries.find(
      (e) =>
        e.type === "aspect:updated" &&
        e.target.uuid === aspect.uuid &&
        Array.isArray(e.payload.changedFields) &&
        (e.payload.changedFields as string[]).includes("color"),
    );
    expect(entry).toBeTruthy();
  });

  it("clears a color by sending null", async () => {
    const aspect = await findAspectByKey("city");
    // First set a color
    await testContext.app.request(`/projects/${project.projectUUID}/aspects/${aspect.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "#a855f7" }),
    });
    // Then clear it
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${aspect.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: null }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { aspect: { color?: string } };
    expect(body.aspect.color).toBeUndefined();
  });

  it("persists color through index: list endpoint returns the set color", async () => {
    const indexed = await findAspectByKey("grief");
    await testContext.app.request(`/projects/${project.projectUUID}/aspects/${indexed.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "#ec4899" }),
    });
    const listResponse = await testContext.app.request(`/projects/${project.projectUUID}/aspects`);
    const aspects = (await listResponse.json()) as Array<{ key: string; color?: string }>;
    const grief = aspects.find((a) => a.key === "grief");
    expect(grief?.color).toBe("#ec4899");
  });
});

describe("PATCH /aspects/:aspectId — no-op and rename split", () => {
  it("emits no log entry for a no-op patch", async () => {
    const indexed = await findAspectByKey("grief");
    const aspect = await readFullAspect(indexed);
    const before = await tailEntries(50);
    const beforeIds = new Set(before.map((e) => e.id));

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${indexed.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: aspect.description,
          notes: aspect.notes,
        }),
      },
    );
    expect(response.status).toBe(200);

    const after = await tailEntries(50);
    const newEntries = after.filter((e) => !beforeIds.has(e.id));
    expect(newEntries).toEqual([]);
  });

  it("emits 'aspect:renamed' and 'aspect:description-edited' when key and description both change", async () => {
    const indexed = await findAspectByKey("memory");

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/aspects/${indexed.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "memory-v2", description: "Revised description." }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries(20);
    const renamed = entries.find(
      (e) => e.type === "aspect:renamed" && e.target.uuid === indexed.uuid,
    );
    const descEdited = entries.find(
      (e) => e.type === "aspect:description-edited" && e.target.uuid === indexed.uuid,
    );
    expect(renamed).toBeTruthy();
    expect(descEdited).toBeTruthy();
  });
});
