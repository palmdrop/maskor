import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { Fragment } from "@maskor/shared";

type LogEntry = {
  id: string;
  type: string;
  timestamp: string;
  target: { uuid: string; key?: string };
  payload: Record<string, unknown>;
};

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
  it("classifies a content+metadata-shaped patch as programmatic and logs only the actual change", async () => {
    const fragment = await findFragmentByKey("late-winter");

    // Programmatic shape: content + (unchanged) metadata in one PATCH.
    // Pre-Stage-2 the editor sent this shape; live metadata save now sends
    // single-field patches, so this path is exercised only by programmatic callers.
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `${fragment.content}\nA new line.`,
          readiness: fragment.readiness,
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
          readiness: fragment.readiness,
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

  it("emits 'fragment:renamed' and 'fragment:edited' when key and content both change", async () => {
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
    const edited = entries.find(
      (entry) => entry.type === "fragment:edited" && entry.target.uuid === fragment.uuid,
    );
    expect(renamed).toBeTruthy();
    expect(edited).toBeTruthy();
  });
});

describe("PATCH /fragments/:fragmentId — single-intent action types", () => {
  it("emits 'fragment:edited' for a content-only save", async () => {
    const fragment = await findFragmentByKey("the-bridge");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `${fragment.content}\nA content-only addition.` }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const edited = entries.find(
      (entry) => entry.type === "fragment:edited" && entry.target.uuid === fragment.uuid,
    );
    expect(edited).toBeTruthy();
  });

  it("emits 'fragment:readiness-changed' with from/to when readiness changes", async () => {
    const fragment = await findFragmentByKey("late-winter");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readiness: 0.5 }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const entry = entries.find(
      (e) => e.type === "fragment:readiness-changed" && e.target.uuid === fragment.uuid,
    );
    expect(entry).toBeTruthy();
    expect(entry?.payload.from).toBe(0.2);
    expect(entry?.payload.to).toBe(0.5);
  });

  it("emits 'fragment:note-attached' when a note is added", async () => {
    const fragment = await findFragmentByKey("late-winter");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: ["bridge observation"] }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const entry = entries.find(
      (e) => e.type === "fragment:note-attached" && e.target.uuid === fragment.uuid,
    );
    expect(entry).toBeTruthy();
    expect(entry?.payload.noteKey).toBe("bridge observation");
  });

  it("emits one detach and one attach when swapping a note in a single PATCH", async () => {
    // the-bridge already has notes: ["bridge observation"] after indexing
    const fragment = await findFragmentByKey("the-bridge");
    // Swap "bridge observation" for "harbour observation"
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: ["harbour observation"] }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries(30);
    const attached = entries.filter(
      (e) => e.type === "fragment:note-attached" && e.target.uuid === fragment.uuid,
    );
    const detached = entries.filter(
      (e) => e.type === "fragment:note-detached" && e.target.uuid === fragment.uuid,
    );
    expect(attached.length).toBe(1);
    expect(detached.length).toBe(1);
    expect(attached[0]?.payload.noteKey).toBe("harbour observation");
    expect(detached[0]?.payload.noteKey).toBe("bridge observation");
  });

  it("emits 'fragment:aspect-weight-changed' with from/to when a weight changes", async () => {
    const fragment = await findFragmentByKey("late-winter");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspects: { ...fragment.aspects, time: { weight: 0.9 } } }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const entry = entries.find(
      (e) => e.type === "fragment:aspect-weight-changed" && e.target.uuid === fragment.uuid,
    );
    expect(entry).toBeTruthy();
    expect(entry?.payload.aspectKey).toBe("time");
    expect(entry?.payload.from).toBe(0.7);
    expect(entry?.payload.to).toBe(0.9);
  });

  it("emits 'fragment:updated' catch-all for a multi-field programmatic patch", async () => {
    const fragment = await findFragmentByKey("harbour-lights-v2");
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `${fragment.content}\nEdited.`,
          readiness: fragment.readiness,
          notes: fragment.notes,
          references: fragment.references,
          aspects: fragment.aspects,
        }),
      },
    );
    expect(response.status).toBe(200);

    const entries = await tailEntries();
    const entry = entries.find(
      (e) => e.type === "fragment:updated" && e.target.uuid === fragment.uuid,
    );
    expect(entry).toBeTruthy();
    const changedFields = entry?.payload.changedFields as string[];
    expect(changedFields).toEqual(["content"]);
  });
});
