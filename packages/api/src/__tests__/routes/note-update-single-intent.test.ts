import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { IndexedNote } from "@maskor/storage";
import type { Note } from "@maskor/shared";

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

const readFullNote = async (indexed: IndexedNote): Promise<Note> => {
  const context = await testContext.storageService.resolveProject(project.projectUUID);
  return testContext.storageService.notes.read(context, indexed.uuid);
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
    const edited = entries.find((e) => e.type === "note:edited" && e.target.uuid === note.uuid);
    expect(edited).toBeTruthy();
    // Must not produce note:updated
    const updated = entries.find((e) => e.type === "note:updated" && e.target.uuid === note.uuid);
    expect(updated).toBeUndefined();
  });
});

describe("PATCH /notes/:noteId — split and no-op behavior", () => {
  it("emits no log entry for a no-op patch", async () => {
    const indexed = await findNoteByKey("harbour observation");
    const note = await readFullNote(indexed);
    const before = await tailEntries(50);
    const beforeIds = new Set(before.map((e) => e.id));

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/${indexed.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: note.content }),
      },
    );
    expect(response.status).toBe(200);

    const after = await tailEntries(50);
    const newEntries = after.filter((e) => !beforeIds.has(e.id));
    expect(newEntries).toEqual([]);
  });

  it("emits 'note:renamed' when only the key changes", async () => {
    const indexed = await findNoteByKey("harbour observation");
    const before = await tailEntries(50);
    const beforeIds = new Set(before.map((e) => e.id));

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/${indexed.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "harbour-observation-v2" }),
      },
    );
    expect(response.status).toBe(200);

    const newEntries = (await tailEntries(50)).filter((e) => !beforeIds.has(e.id));
    const renamed = newEntries.find(
      (e) => e.type === "note:renamed" && e.target.uuid === indexed.uuid,
    );
    expect(renamed).toBeTruthy();
    expect(renamed?.payload.oldKey).toBe("harbour observation");
    expect(renamed?.payload.newKey).toBe("harbour-observation-v2");
    const edited = newEntries.find(
      (e) => e.type === "note:edited" && e.target.uuid === indexed.uuid,
    );
    expect(edited).toBeUndefined();
  });

  it("emits 'note:renamed' and 'note:edited' when key and content both change", async () => {
    const indexed = await findNoteByKey("bridge observation");

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/notes/${indexed.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "bridge-observation-v2", content: "Revised note content." }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries(20);
    const renamed = entries.find(
      (e) => e.type === "note:renamed" && e.target.uuid === indexed.uuid,
    );
    const edited = entries.find((e) => e.type === "note:edited" && e.target.uuid === indexed.uuid);
    expect(renamed).toBeTruthy();
    expect(edited).toBeTruthy();
  });
});
