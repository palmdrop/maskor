import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { IndexedNote } from "@maskor/storage";

type LogEntry = {
  id: string;
  type: string;
  timestamp: string;
  target: { uuid: string; key?: string };
  payload: Record<string, unknown>;
};

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

const findNoteByKey = async (key: string): Promise<IndexedNote> => {
  const context = await testContext.storageService.resolveProject(project.projectUUID);
  const all = await testContext.storageService.notes.readAll(context);
  const match = all.find((note) => note.key === key);
  if (!match) throw new Error(`Note "${key}" not found`);
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

describe("PATCH /notes/:noteId — note:edited vs note:updated", () => {
  it("emits 'note:edited' when only content changes", async () => {
    const note = await findNoteByKey("bridge observation");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/${note.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated note content." }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const edited = entries.find(
      (e) => e.type === "note:edited" && e.target.uuid === note.uuid,
    );
    expect(edited).toBeTruthy();
    // Must not produce note:updated
    const updated = entries.find(
      (e) => e.type === "note:updated" && e.target.uuid === note.uuid,
    );
    expect(updated).toBeUndefined();
  });
});
