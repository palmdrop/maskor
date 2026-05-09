import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { IndexedReference } from "@maskor/storage";

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
