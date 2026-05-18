import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { LogEntry } from "@maskor/shared";

type SequenceSummary = { uuid: string; name: string; isMain: boolean; filePath: string };
type Section = {
  uuid: string;
  name: string;
  fragments: { uuid: string; fragmentUuid: string; position: number }[];
};
type SequenceFull = SequenceSummary & {
  projectUuid: string;
  contentHash: string;
  sections: Section[];
};

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

const baseUrl = () => `/projects/${project.projectUUID}/sequences`;

describe("GET /projects/:projectId/sequences", () => {
  it("returns empty list when no sequences exist", async () => {
    const response = await testContext.app.request(baseUrl());
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceSummary[];
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("GET /projects/:projectId/sequences/main", () => {
  it("auto-creates and returns a main sequence", async () => {
    const response = await testContext.app.request(`${baseUrl()}/main`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceFull;
    expect(body.isMain).toBe(true);
    expect(body.sections).toHaveLength(1);
  });

  it("returns the same sequence on subsequent calls", async () => {
    const first = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const second = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    expect(first.uuid).toBe(second.uuid);
  });
});

describe("POST /projects/:projectId/sequences", () => {
  it("creates a named sequence and returns 201", async () => {
    const response = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Draft Order",
        isMain: false,
        projectUuid: project.projectUUID,
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SequenceFull;
    expect(body.name).toBe("Draft Order");
    expect(body.isMain).toBe(false);
  });

  it("returns 409 when name conflicts with existing sequence", async () => {
    await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Unique Name",
        isMain: false,
        projectUuid: project.projectUUID,
      }),
    });
    const conflict = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Unique Name",
        isMain: false,
        projectUuid: project.projectUUID,
      }),
    });
    expect(conflict.status).toBe(409);
    const body = (await conflict.json()) as { error: string; reason?: string };
    expect(body.error).toBe("CONFLICT");
    expect(body.reason).toBe("name_conflict");
  });

  it("allows two sequences whose names differ only by case", async () => {
    const first = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "CaseExample",
        isMain: false,
        projectUuid: project.projectUUID,
      }),
    });
    expect(first.status).toBe(201);
    const second = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "caseexample",
        isMain: false,
        projectUuid: project.projectUUID,
      }),
    });
    expect(second.status).toBe(201);
  });
});

describe("GET /projects/:projectId/sequences/:sequenceId", () => {
  it("returns a sequence by UUID", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const response = await testContext.app.request(`${baseUrl()}/${main.uuid}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceFull;
    expect(body.uuid).toBe(main.uuid);
  });

  it("returns 404 for an unknown UUID", async () => {
    const response = await testContext.app.request(
      `${baseUrl()}/00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /projects/:projectId/sequences/:sequenceId", () => {
  it("renames a sequence", async () => {
    const created = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "To Be Renamed",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceFull;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceFull;
    expect(body.name).toBe("Renamed");
  });

  it("rejects renaming to a name that collides with another sequence", async () => {
    const target = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rename Target",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceFull;

    const blocker = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rename Blocker",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceFull;

    const response = await testContext.app.request(`${baseUrl()}/${target.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: blocker.name }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; reason?: string };
    expect(body.error).toBe("CONFLICT");
    expect(body.reason).toBe("name_conflict");
  });

  it("allows renaming a sequence to its own current name (no-op)", async () => {
    const created = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Self Rename",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceFull;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: created.name }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceFull;
    expect(body.name).toBe(created.name);
  });

  it("promotes a non-main sequence to main", async () => {
    const created = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Promote Me",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceFull;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMain: true }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceFull;
    expect(body.isMain).toBe(true);
  });
});

describe("DELETE /projects/:projectId/sequences/:sequenceId", () => {
  it("deletes a non-main sequence and returns 204", async () => {
    const created = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Delete Me",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceFull;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
  });

  it("returns 409 when deleting the main sequence", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const response = await testContext.app.request(`${baseUrl()}/${main.uuid}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(409);
  });
});

describe("POST /projects/:projectId/sequences/:sequenceId/positions", () => {
  it("places a fragment and returns the updated sequence", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const sectionUuid = main.sections[0]!.uuid;

    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as { uuid: string }[];
    const fragmentUuid = fragments[0]!.uuid;

    const response = await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid, sectionUuid, position: 0 }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceFull;
    expect(body.sections[0]!.fragments).toHaveLength(1);
    expect(body.sections[0]!.fragments[0]!.fragmentUuid).toBe(fragmentUuid);
  });

  it("returns 409 when placing an already-placed fragment", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const alreadyPlaced = main.sections[0]!.fragments[0];
    if (!alreadyPlaced) return;

    const response = await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragmentUuid: alreadyPlaced.fragmentUuid,
        sectionUuid: main.sections[0]!.uuid,
        position: 0,
      }),
    });
    expect(response.status).toBe(409);
  });
});

describe("PATCH /projects/:projectId/sequences/:sequenceId/positions/:fragmentUuid", () => {
  it("moves a placed fragment to a new position", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const sectionUuid = main.sections[0]!.uuid;

    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as { uuid: string }[];
    const unplaced = fragments.find(
      (f) => !main.sections.some((s) => s.fragments.some((fp) => fp.fragmentUuid === f.uuid)),
    );
    if (!unplaced) return;

    await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: unplaced.uuid, sectionUuid, position: 0 }),
    });

    const response = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/positions/${unplaced.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionUuid, position: 1 }),
      },
    );
    expect(response.status).toBe(200);
  });
});

describe("DELETE /projects/:projectId/sequences/:sequenceId/positions/:fragmentUuid", () => {
  it("unplaces a fragment and returns the updated sequence", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const placed = main.sections[0]!.fragments[0];
    if (!placed) return;

    const response = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/positions/${placed.fragmentUuid}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(200);
  });
});

describe("sequence fragment action log entries", () => {
  it("place records target.title and payload.fragmentKey", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const sectionUuid = main.sections[0]!.uuid;

    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as { uuid: string; key: string }[];
    const unplaced = fragments.find(
      (f) => !main.sections.some((s) => s.fragments.some((fp) => fp.fragmentUuid === f.uuid)),
    );
    if (!unplaced) return;

    await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: unplaced.uuid, sectionUuid, position: 0 }),
    });

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    const entry = entries.find((e) => e.type === "sequence:fragment-placed");
    expect(entry).toBeDefined();
    expect(entry!.target.title).toBe(main.name);
    expect((entry!.payload as { fragmentKey: string }).fragmentKey).toBe(unplaced.key);
  });

  it("move records target.title and payload.fragmentKey", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const sectionUuid = main.sections[0]!.uuid;
    const placed = main.sections[0]!.fragments[0];
    if (!placed) return;

    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as { uuid: string; key: string }[];
    const placedFragment = fragments.find((f) => f.uuid === placed.fragmentUuid);
    if (!placedFragment) return;

    await testContext.app.request(
      `${baseUrl()}/${main.uuid}/positions/${placed.fragmentUuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionUuid, position: 0 }),
      },
    );

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    const entry = entries.find((e) => e.type === "sequence:fragment-moved");
    expect(entry).toBeDefined();
    expect(entry!.target.title).toBe(main.name);
    expect((entry!.payload as { fragmentKey: string }).fragmentKey).toBe(placedFragment.key);
  });

  it("unplace records target.title and payload.fragmentKey", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const placed = main.sections[0]!.fragments[0];
    if (!placed) return;

    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as { uuid: string; key: string }[];
    const placedFragment = fragments.find((f) => f.uuid === placed.fragmentUuid);
    if (!placedFragment) return;

    await testContext.app.request(
      `${baseUrl()}/${main.uuid}/positions/${placed.fragmentUuid}`,
      { method: "DELETE" },
    );

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    const entry = entries.find((e) => e.type === "sequence:fragment-unplaced");
    expect(entry).toBeDefined();
    expect(entry!.target.title).toBe(main.name);
    expect((entry!.payload as { fragmentKey: string }).fragmentKey).toBe(placedFragment.key);
  });
});
