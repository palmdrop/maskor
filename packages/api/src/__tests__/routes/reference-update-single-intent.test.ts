import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { IndexedReference } from "@maskor/storage";
import type { Reference } from "@maskor/shared";

type LogEntry = {
  id: string;
  type: string;
  timestamp: string;
  target: { uuid: string; key?: string };
  payload: Record<string, unknown>;
};

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

const findReferenceByKey = async (key: string): Promise<IndexedReference> => {
  const context = await testContext.storageService.resolveProject(project.projectUUID);
  const all = await testContext.storageService.references.readAll(context);
  const match = all.find((reference) => reference.key === key);
  if (!match) throw new Error(`Reference "${key}" not found`);
  return match;
};

const readFullReference = async (indexed: IndexedReference): Promise<Reference> => {
  const context = await testContext.storageService.resolveProject(project.projectUUID);
  return testContext.storageService.references.read(context, indexed.uuid);
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

describe("PATCH /references/:referenceId — reference:edited vs reference:updated", () => {
  it("emits 'reference:edited' when only content changes", async () => {
    const reference = await findReferenceByKey("city research");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/references/${reference.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated reference content." }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const edited = entries.find(
      (e) => e.type === "reference:edited" && e.target.uuid === reference.uuid,
    );
    expect(edited).toBeTruthy();
    // Must not produce reference:updated
    const updated = entries.find(
      (e) => e.type === "reference:updated" && e.target.uuid === reference.uuid,
    );
    expect(updated).toBeUndefined();
  });
});

describe("PATCH /references/:referenceId — split and no-op behavior", () => {
  it("emits no log entry for a no-op patch", async () => {
    const indexed = await findReferenceByKey("city research");
    const reference = await readFullReference(indexed);
    const before = await tailEntries(50);
    const beforeIds = new Set(before.map((e) => e.id));

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/references/${indexed.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reference.content }),
      },
    );
    expect(response.status).toBe(200);

    const after = await tailEntries(50);
    const newEntries = after.filter((e) => !beforeIds.has(e.id));
    expect(newEntries).toEqual([]);
  });

  it("emits 'reference:renamed' when only the key changes", async () => {
    const indexed = await findReferenceByKey("city research");
    const before = await tailEntries(50);
    const beforeIds = new Set(before.map((e) => e.id));

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/references/${indexed.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "city-research-v2" }),
      },
    );
    expect(response.status).toBe(200);

    const newEntries = (await tailEntries(50)).filter((e) => !beforeIds.has(e.id));
    const renamed = newEntries.find(
      (e) => e.type === "reference:renamed" && e.target.uuid === indexed.uuid,
    );
    expect(renamed).toBeTruthy();
    expect(renamed?.payload.oldKey).toBe("city research");
    expect(renamed?.payload.newKey).toBe("city-research-v2");
    const edited = newEntries.find(
      (e) => e.type === "reference:edited" && e.target.uuid === indexed.uuid,
    );
    expect(edited).toBeUndefined();
  });

  it("emits 'reference:renamed' and 'reference:edited' when key and content both change", async () => {
    const indexed = await findReferenceByKey("city-research-v2");

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/references/${indexed.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "city-research-v3", content: "Revised reference content." }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries(20);
    const renamed = entries.find(
      (e) => e.type === "reference:renamed" && e.target.uuid === indexed.uuid,
    );
    const edited = entries.find(
      (e) => e.type === "reference:edited" && e.target.uuid === indexed.uuid,
    );
    expect(renamed).toBeTruthy();
    expect(edited).toBeTruthy();
  });
});
