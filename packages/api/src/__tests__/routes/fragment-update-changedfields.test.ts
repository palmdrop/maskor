import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { Fragment, LogEntry } from "@maskor/shared";

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

const findFragmentByKey = async (key: string): Promise<Fragment> => {
  const context = await testContext.storageService.resolveProject(project.projectUUID);
  const indexed = await testContext.storageService.fragments.readAll(context);
  const match = indexed.find((fragment) => fragment.key === key);
  if (!match) throw new Error(`Fragment "${key}" not found`);
  return testContext.storageService.fragments.read(context, match.uuid);
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

describe("PATCH /fragments/:fragmentId — changedFields reflects only real changes", () => {
  it("logs only 'content' when the user edits prose but resends unchanged metadata", async () => {
    const fragment = await findFragmentByKey("late-winter");

    // Frontend behavior: every save sends the full metadata payload alongside content.
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `${fragment.content}\nA new line.`,
          readyStatus: fragment.readyStatus,
          notes: fragment.notes,
          references: fragment.references,
          aspects: fragment.aspects,
        }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const updateEntry = entries.find(
      (entry) => entry.type === "fragment:updated" && entry.target.uuid === fragment.uuid,
    );
    expect(updateEntry).toBeTruthy();
    if (updateEntry?.type !== "fragment:updated") throw new Error("type narrow");
    const payload = updateEntry.payload as { changedFields: string[] };
    expect(payload.changedFields).toEqual(["content"]);
  });

  it("emits no log entry and no fragment write for a no-op patch", async () => {
    const fragment = await findFragmentByKey("the-bridge");
    const beforeUpdatedAt = fragment.updatedAt;

    const before = await tailEntries(50);
    const beforeIds = new Set(before.map((entry) => entry.id));

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fragment.content,
          readyStatus: fragment.readyStatus,
          notes: fragment.notes,
          references: fragment.references,
          aspects: fragment.aspects,
        }),
      },
    );
    expect(response.status).toBe(200);

    const after = await tailEntries(50);
    const newEntries = after.filter((entry) => !beforeIds.has(entry.id));
    expect(newEntries).toEqual([]);

    const refreshed = await findFragmentByKey("the-bridge");
    expect(refreshed.updatedAt.getTime()).toBe(beforeUpdatedAt.getTime());
  });

  it("emits both 'fragment:renamed' and 'fragment:updated' when key and content both change", async () => {
    const fragment = await findFragmentByKey("harbour-lights");
    const newKey = "harbour-lights-v2";

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey,
          content: `${fragment.content}\nAnother line.`,
        }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries(20);
    const renamed = entries.find(
      (entry) => entry.type === "fragment:renamed" && entry.target.uuid === fragment.uuid,
    );
    const updated = entries.find(
      (entry) => entry.type === "fragment:updated" && entry.target.uuid === fragment.uuid,
    );
    expect(renamed).toBeTruthy();
    expect(updated).toBeTruthy();
    if (updated?.type !== "fragment:updated") throw new Error("type narrow");
    const updatedPayload = updated.payload as { changedFields: string[] };
    expect(updatedPayload.changedFields).toEqual(["content"]);
  });
});
