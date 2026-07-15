import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { LogEntry } from "@maskor/shared";

type SequenceSummary = {
  uuid: string;
  name: string;
  isMain: boolean;
  active: boolean;
  filePath: string;
};
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
type SequenceBundle = {
  sequences: SequenceFull[];
  violations: { fragmentUuid: string; predecessorUuid: string; secondaryUuid: string }[];
  cycles: { sequenceUuids: string[]; fragmentUuids: string[] }[];
};

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
});

afterAll(async () => {
  await testContext.cleanup();
});

const baseUrl = () => `/projects/${project.projectUUID}/sequences`;

describe("GET /projects/:projectId/sequences", () => {
  it("returns bundled response when no sequences exist", async () => {
    const response = await testContext.app.request(baseUrl());
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceBundle;
    expect(Array.isArray(body.sequences)).toBe(true);
    expect(Array.isArray(body.violations)).toBe(true);
    expect(Array.isArray(body.cycles)).toBe(true);
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
  it("creates a named sequence and returns 201 bundle", async () => {
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
    const body = (await response.json()) as SequenceBundle;
    const created = body.sequences.find((s) => s.name === "Draft Order");
    expect(created).toBeDefined();
    expect(created?.isMain).toBe(false);
    expect(created?.active).toBe(true);
  });

  it("honors active: false from the request body", async () => {
    const response = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Created Inactive",
        isMain: false,
        active: false,
        projectUuid: project.projectUUID,
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SequenceBundle;
    const created = body.sequences.find((s) => s.name === "Created Inactive");
    expect(created?.active).toBe(false);
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

  it("returns 400 for a whitespace-only name (slips past the schema's min(1))", async () => {
    const response = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "   ",
        isMain: false,
        projectUuid: project.projectUUID,
      }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("SEQUENCE_NAME_INVALID");
  });

  it("trims surrounding whitespace from the name", async () => {
    const response = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Padded Name  ",
        isMain: false,
        projectUuid: project.projectUUID,
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SequenceBundle;
    expect(body.sequences.find((s) => s.name === "Padded Name")).toBeDefined();
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
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "To Be Renamed",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const created = createBundle.sequences.find((s) => s.name === "To Be Renamed")!;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceBundle;
    const renamed = body.sequences.find((s) => s.uuid === created.uuid);
    expect(renamed?.name).toBe("Renamed");
  });

  it("returns 400 when renaming to a whitespace-only name", async () => {
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Keeps Its Name",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const created = createBundle.sequences.find((s) => s.name === "Keeps Its Name")!;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("SEQUENCE_NAME_INVALID");
  });

  it("toggles the active flag", async () => {
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Toggle Active",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const created = createBundle.sequences.find((s) => s.name === "Toggle Active")!;
    expect(created.active).toBe(true);

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceBundle;
    const updated = body.sequences.find((s) => s.uuid === created.uuid);
    expect(updated?.active).toBe(false);
  });

  it("rejects renaming to a name that collides with another sequence", async () => {
    const targetBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rename Target",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const target = targetBundle.sequences.find((s) => s.name === "Rename Target")!;

    const blockerBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rename Blocker",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const blocker = blockerBundle.sequences.find((s) => s.name === "Rename Blocker")!;

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
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Self Rename",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const created = createBundle.sequences.find((s) => s.name === "Self Rename")!;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: created.name }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceBundle;
    const renamed = body.sequences.find((s) => s.uuid === created.uuid);
    expect(renamed?.name).toBe(created.name);
  });

  it("records no rename log entry when the new name only differs by surrounding whitespace", async () => {
    const uniqueName = `Padded Rename ${Date.now()}`;
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uniqueName,
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const created = createBundle.sequences.find((s) => s.name === uniqueName)!;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `  ${uniqueName}  ` }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceBundle;
    const renamed = body.sequences.find((s) => s.uuid === created.uuid);
    expect(renamed?.name).toBe(uniqueName);

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=50`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    const renameEntry = entries.find(
      (entry) => entry.type === "sequence:renamed" && entry.target.uuid === created.uuid,
    );
    expect(renameEntry).toBeUndefined();
  });

  it("promotes a non-main sequence to main", async () => {
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Promote Me",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const created = createBundle.sequences.find((s) => s.name === "Promote Me")!;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMain: true }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceBundle;
    const promoted = body.sequences.find((s) => s.uuid === created.uuid);
    expect(promoted?.isMain).toBe(true);
  });
});

describe("active-gating of constraints", () => {
  // Two secondaries imposing opposite orderings of the same fragment pair form a
  // cycle — but only while both are active. Deactivating one clears it.
  const createSecondary = async (name: string): Promise<SequenceFull> => {
    const bundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isMain: false, projectUuid: project.projectUUID }),
      })
    ).json()) as SequenceBundle;
    return bundle.sequences.find((s) => s.name === name)! as SequenceFull;
  };

  const place = async (sequence: SequenceFull, fragmentUuid: string, position: number) => {
    await testContext.app.request(`${baseUrl()}/${sequence.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragmentUuid,
        sectionUuid: sequence.sections[0]!.uuid,
        position,
      }),
    });
  };

  it("excludes inactive sequences from cycle detection", async () => {
    const summaries = (await (
      await testContext.app.request(`/projects/${project.projectUUID}/fragments/summaries`)
    ).json()) as Array<{ uuid: string }>;
    const [first, second] = summaries;
    if (!first || !second) throw new Error("expected at least two seeded fragments");

    const forward = await createSecondary("Cycle Forward");
    await place(forward, first.uuid, 0);
    await place(forward, second.uuid, 1);

    const backward = await createSecondary("Cycle Backward");
    await place(backward, second.uuid, 0);
    await place(backward, first.uuid, 1);

    // Both active → the two orderings contradict → a cycle is reported.
    const withBoth = (await (await testContext.app.request(baseUrl())).json()) as SequenceBundle;
    expect(withBoth.cycles.length).toBeGreaterThan(0);

    // Deactivate one → no remaining contradiction → no cycle.
    await testContext.app.request(`${baseUrl()}/${backward.uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    const afterDeactivate = (await (
      await testContext.app.request(baseUrl())
    ).json()) as SequenceBundle;
    expect(afterDeactivate.cycles.length).toBe(0);

    // Clean up so these orderings don't pollute later violation/cycle tests.
    await testContext.app.request(`${baseUrl()}/${forward.uuid}`, { method: "DELETE" });
    await testContext.app.request(`${baseUrl()}/${backward.uuid}`, { method: "DELETE" });
  });
});

describe("DELETE /projects/:projectId/sequences/:sequenceId", () => {
  it("deletes a non-main sequence and returns 200 bundle", async () => {
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Delete Me",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const created = createBundle.sequences.find((s) => s.name === "Delete Me")!;

    const response = await testContext.app.request(`${baseUrl()}/${created.uuid}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SequenceBundle;
    expect(body.sequences.some((s) => s.uuid === created.uuid)).toBe(false);
  });

  it("returns 409 when deleting the main sequence", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const response = await testContext.app.request(`${baseUrl()}/${main.uuid}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; reason?: string };
    expect(body.error).toBe("CONFLICT");
    expect(body.reason).toBe("cannot_delete_main");
  });

  it("fragments remain in the project after non-main sequence deletion", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;

    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Secondary To Delete",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const secondary = createBundle.sequences.find((s) => s.name === "Secondary To Delete")!;

    const fragmentsResp = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResp.json()) as { uuid: string }[];
    const fragment = fragments[0];
    if (!fragment) return;

    await testContext.app.request(`${baseUrl()}/${secondary.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragmentUuid: fragment.uuid,
        sectionUuid: secondary.sections[0]!.uuid,
        position: 0,
      }),
    });

    const deleteResp = await testContext.app.request(`${baseUrl()}/${secondary.uuid}`, {
      method: "DELETE",
    });
    expect(deleteResp.status).toBe(200);

    const afterFragmentsResp = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const afterFragments = (await afterFragmentsResp.json()) as { uuid: string }[];
    expect(afterFragments.some((f) => f.uuid === fragment.uuid)).toBe(true);

    const mainAfter = (await (
      await testContext.app.request(`${baseUrl()}/${main.uuid}`)
    ).json()) as SequenceFull;
    expect(mainAfter.uuid).toBe(main.uuid);
  });
});

describe("POST /projects/:projectId/sequences/:sequenceId/positions", () => {
  it("places a fragment and returns the updated bundle", async () => {
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
    const body = (await response.json()) as SequenceBundle;
    const mainInBundle = body.sequences.find((s) => s.uuid === main.uuid)!;
    expect(mainInBundle.sections[0]!.fragments).toHaveLength(1);
    expect(mainInBundle.sections[0]!.fragments[0]!.fragmentUuid).toBe(fragmentUuid);
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
    const body = (await response.json()) as SequenceBundle;
    expect(Array.isArray(body.sequences)).toBe(true);
  });
});

describe("DELETE /projects/:projectId/sequences/:sequenceId/positions/:fragmentUuid", () => {
  it("unplaces a fragment and returns the updated bundle", async () => {
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
    const body = (await response.json()) as SequenceBundle;
    const mainInBundle = body.sequences.find((s) => s.uuid === main.uuid)!;
    expect(
      mainInBundle.sections[0]!.fragments.some((f) => f.fragmentUuid === placed.fragmentUuid),
    ).toBe(false);
  });
});

describe("POST /projects/:projectId/sequences/:sequenceId/designate-main", () => {
  it("flips main from A to B: B becomes main, A becomes secondary", async () => {
    const mainBefore = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;

    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Designate Test Secondary",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const secondary = createBundle.sequences.find((s) => s.name === "Designate Test Secondary")!;

    const response = await testContext.app.request(
      `${baseUrl()}/${secondary.uuid}/designate-main`,
      { method: "POST" },
    );
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    expect(Array.isArray(bundle.sequences)).toBe(true);
    expect(Array.isArray(bundle.violations)).toBe(true);
    expect(Array.isArray(bundle.cycles)).toBe(true);

    const newMain = bundle.sequences.find((s) => s.uuid === secondary.uuid);
    const oldMain = bundle.sequences.find((s) => s.uuid === mainBefore.uuid);
    expect(newMain?.isMain).toBe(true);
    expect(oldMain?.isMain).toBe(false);
  });

  it("designating the already-main sequence is idempotent", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;

    const response = await testContext.app.request(`${baseUrl()}/${main.uuid}/designate-main`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const stillMain = bundle.sequences.find((s) => s.uuid === main.uuid);
    expect(stillMain?.isMain).toBe(true);
  });

  it("returns 404 for a non-existent sequence UUID", async () => {
    const response = await testContext.app.request(
      `${baseUrl()}/00000000-0000-0000-0000-000000000000/designate-main`,
      { method: "POST" },
    );
    expect(response.status).toBe(404);
  });
});

describe("bundled response - violations and cycles integration", () => {
  it("includes a violation when secondary order differs from main", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;

    const fragmentsResp = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const allFragments = (await fragmentsResp.json()) as { uuid: string }[];
    const unplacedInMain = allFragments.filter(
      (f) => !main.sections.some((s) => s.fragments.some((fp) => fp.fragmentUuid === f.uuid)),
    );
    if (unplacedInMain.length < 2) return;
    const [fragA, fragB] = [unplacedInMain[0]!, unplacedInMain[1]!];

    await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragmentUuid: fragA.uuid,
        sectionUuid: main.sections[0]!.uuid,
        position: 0,
      }),
    });
    await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragmentUuid: fragB.uuid,
        sectionUuid: main.sections[0]!.uuid,
        position: 1,
      }),
    });

    const secBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Violation Secondary",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const sec = secBundle.sequences.find((s) => s.name === "Violation Secondary")!;

    await testContext.app.request(`${baseUrl()}/${sec.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragmentUuid: fragB.uuid,
        sectionUuid: sec.sections[0]!.uuid,
        position: 0,
      }),
    });
    const placeBundle = (await (
      await testContext.app.request(`${baseUrl()}/${sec.uuid}/positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fragmentUuid: fragA.uuid,
          sectionUuid: sec.sections[0]!.uuid,
          position: 1,
        }),
      })
    ).json()) as SequenceBundle;

    const violation = placeBundle.violations.find((v) => v.secondaryUuid === sec.uuid);
    expect(violation).toBeDefined();
    expect(violation?.predecessorUuid).toBe(fragB.uuid);
    expect(violation?.fragmentUuid).toBe(fragA.uuid);
  });

  it("lists sequences bundle from GET /sequences with populated violations/cycles shape", async () => {
    const response = await testContext.app.request(baseUrl());
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    expect(Array.isArray(bundle.sequences)).toBe(true);
    expect(Array.isArray(bundle.violations)).toBe(true);
    expect(Array.isArray(bundle.cycles)).toBe(true);
    expect(bundle.sequences.length).toBeGreaterThan(0);
  });
});

describe("POST /projects/:projectId/sequences/:sequenceId/sections", () => {
  it("appends a new section after existing sections", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const sectionCountBefore = main.sections.length;

    const response = await testContext.app.request(`${baseUrl()}/${main.uuid}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Section" }),
    });
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === main.uuid)!;
    expect(updated.sections).toHaveLength(sectionCountBefore + 1);
    expect(updated.sections[updated.sections.length - 1]!.name).toBe("New Section");
  });

  it("a freshly-created section can accept fragment placements", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;

    const sectionBundle = (await (
      await testContext.app.request(`${baseUrl()}/${main.uuid}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Placement Test Section" }),
      })
    ).json()) as SequenceBundle;
    const updatedMain = sectionBundle.sequences.find((s) => s.uuid === main.uuid)!;
    const newSection = updatedMain.sections[updatedMain.sections.length - 1]!;

    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as { uuid: string }[];
    const unplaced = fragments.find(
      (f) =>
        !updatedMain.sections.some((s) => s.fragments.some((fp) => fp.fragmentUuid === f.uuid)),
    );
    if (!unplaced) return;

    const placeResponse = await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragmentUuid: unplaced.uuid,
        sectionUuid: newSection.uuid,
        position: 0,
      }),
    });
    expect(placeResponse.status).toBe(200);
    const placeBundle = (await placeResponse.json()) as SequenceBundle;
    const mainAfter = placeBundle.sequences.find((s) => s.uuid === main.uuid)!;
    const sectionAfter = mainAfter.sections.find((s) => s.uuid === newSection.uuid)!;
    expect(sectionAfter.fragments).toHaveLength(1);
    expect(sectionAfter.fragments[0]!.fragmentUuid).toBe(unplaced.uuid);
  });

  it("works for secondary sequences too", async () => {
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Section Test Secondary",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const secondary = createBundle.sequences.find((s) => s.name === "Section Test Secondary")!;

    const response = await testContext.app.request(`${baseUrl()}/${secondary.uuid}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Secondary Section" }),
    });
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === secondary.uuid)!;
    expect(updated.sections.length).toBeGreaterThan(1);
    expect(updated.sections[updated.sections.length - 1]!.name).toBe("Secondary Section");
  });

  it("returns 404 for a non-existent sequence", async () => {
    const response = await testContext.app.request(
      `${baseUrl()}/00000000-0000-0000-0000-000000000000/sections`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ghost Section" }),
      },
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /projects/:projectId/sequences/:sequenceId/sections/:sectionId", () => {
  it("renames an existing section and reflects the change in the bundle", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const section = main.sections[0]!;

    const response = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/sections/${section.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed Section" }),
      },
    );
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === main.uuid)!;
    const renamedSection = updated.sections.find((s) => s.uuid === section.uuid)!;
    expect(renamedSection.name).toBe("Renamed Section");
  });

  it("allows renaming a section to an empty string", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const section = main.sections[0]!;

    const response = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/sections/${section.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      },
    );
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === main.uuid)!;
    const renamedSection = updated.sections.find((s) => s.uuid === section.uuid)!;
    expect(renamedSection.name).toBe("");
  });

  it("allows two sections with the same name", async () => {
    const createBundle = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const main = createBundle;

    const sectionBundle = (await (
      await testContext.app.request(`${baseUrl()}/${main.uuid}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Dupe Section" }),
      })
    ).json()) as SequenceBundle;
    const updatedMain = sectionBundle.sequences.find((s) => s.uuid === main.uuid)!;
    const firstSection = updatedMain.sections[0]!;
    const secondSection = updatedMain.sections[updatedMain.sections.length - 1]!;

    const renameFirst = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/sections/${firstSection.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Duplicate Name" }),
      },
    );
    expect(renameFirst.status).toBe(200);

    const renameSecond = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/sections/${secondSection.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Duplicate Name" }),
      },
    );
    expect(renameSecond.status).toBe(200);
  });

  it("returns 404 for a non-existent section UUID", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;

    const response = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/sections/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ghost" }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for a non-existent sequence", async () => {
    const response = await testContext.app.request(
      `${baseUrl()}/00000000-0000-0000-0000-000000000000/sections/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ghost" }),
      },
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /projects/:projectId/sequences/:sequenceId/sections/:sectionId", () => {
  it("deletes a section and its fragments are unplaced back to the pool", async () => {
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Delete Section Test Seq",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const sequence = createBundle.sequences.find((s) => s.name === "Delete Section Test Seq")!;

    const sectionBundle = (await (
      await testContext.app.request(`${baseUrl()}/${sequence.uuid}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Section To Delete" }),
      })
    ).json()) as SequenceBundle;
    const updatedSeq = sectionBundle.sequences.find((s) => s.uuid === sequence.uuid)!;
    const sectionToDelete = updatedSeq.sections[updatedSeq.sections.length - 1]!;

    const fragmentsResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await fragmentsResponse.json()) as { uuid: string }[];
    const unplaced = fragments.find(
      (f) => !updatedSeq.sections.some((s) => s.fragments.some((fp) => fp.fragmentUuid === f.uuid)),
    );

    if (unplaced) {
      await testContext.app.request(`${baseUrl()}/${sequence.uuid}/positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fragmentUuid: unplaced.uuid,
          sectionUuid: sectionToDelete.uuid,
          position: 0,
        }),
      });
    }

    const deleteResponse = await testContext.app.request(
      `${baseUrl()}/${sequence.uuid}/sections/${sectionToDelete.uuid}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(200);
    const deleteBundle = (await deleteResponse.json()) as SequenceBundle;
    const afterSeq = deleteBundle.sequences.find((s) => s.uuid === sequence.uuid)!;
    expect(afterSeq.sections.some((s) => s.uuid === sectionToDelete.uuid)).toBe(false);

    if (unplaced) {
      const isStillPlaced = afterSeq.sections.some((s) =>
        s.fragments.some((fp) => fp.fragmentUuid === unplaced.uuid),
      );
      expect(isStillPlaced).toBe(false);
    }
  });

  it("remaining sections still exist after deletion", async () => {
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Compaction Test Seq",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const sequence = createBundle.sequences.find((s) => s.name === "Compaction Test Seq")!;

    // TODO: Figure out why this is unused
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const after1 = (await (
      await testContext.app.request(`${baseUrl()}/${sequence.uuid}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Section B" }),
      })
    ).json()) as SequenceBundle;
    const after2Bundle = (await (
      await testContext.app.request(`${baseUrl()}/${sequence.uuid}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Section C" }),
      })
    ).json()) as SequenceBundle;
    const seqWith3 = after2Bundle.sequences.find((s) => s.uuid === sequence.uuid)!;
    expect(seqWith3.sections).toHaveLength(3);

    const middleSection = seqWith3.sections[1]!;
    const deleteResponse = await testContext.app.request(
      `${baseUrl()}/${sequence.uuid}/sections/${middleSection.uuid}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(200);
    const afterBundle = (await deleteResponse.json()) as SequenceBundle;
    const afterSeq = afterBundle.sequences.find((s) => s.uuid === sequence.uuid)!;
    expect(afterSeq.sections).toHaveLength(2);
    expect(afterSeq.sections.some((s) => s.uuid === middleSection.uuid)).toBe(false);
    expect(afterSeq.sections[0]!.name).toBe(seqWith3.sections[0]!.name);
    expect(afterSeq.sections[1]!.name).toBe(seqWith3.sections[2]!.name);
  });

  it("returns 409 when deleting the last remaining section", async () => {
    const createBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Last Section Guard Seq",
          isMain: false,
          projectUuid: project.projectUUID,
        }),
      })
    ).json()) as SequenceBundle;
    const sequence = createBundle.sequences.find((s) => s.name === "Last Section Guard Seq")!;
    expect(sequence.sections).toHaveLength(1);

    const response = await testContext.app.request(
      `${baseUrl()}/${sequence.uuid}/sections/${sequence.sections[0]!.uuid}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; reason?: string };
    expect(body.error).toBe("CONFLICT");
    expect(body.reason).toBe("cannot_delete_last_section");
  });

  it("returns 404 for a non-existent section", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;

    const response = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/sections/00000000-0000-0000-0000-000000000000`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
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

    await testContext.app.request(`${baseUrl()}/${main.uuid}/positions/${placed.fragmentUuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionUuid, position: 0 }),
    });

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    const entry = entries.find((e) => e.type === "sequence:fragment-moved");
    expect(entry).toBeDefined();
    expect(entry!.target.title).toBe(main.name);
    expect((entry!.payload as { fragmentKey: string }).fragmentKey).toBe(placedFragment.key);
  });

  it("reorder section moves it to the target position and logs section-reordered", async () => {
    // Create a fresh secondary sequence to avoid shared-state interference
    const uniqueName = `Reorder Test ${Date.now()}`;
    const createResp = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: uniqueName, isMain: false, projectUuid: project.projectUUID }),
    });
    expect(createResp.status).toBe(201);
    const createBundle = (await createResp.json()) as SequenceBundle;
    const seq = createBundle.sequences.find((s) => s.name === uniqueName)!;

    // Add a second section
    const afterCreate = (await (
      await testContext.app.request(`${baseUrl()}/${seq.uuid}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Act Two" }),
      })
    ).json()) as SequenceBundle;

    const sequence = afterCreate.sequences.find((s) => s.uuid === seq.uuid)!;
    expect(sequence.sections).toHaveLength(2);

    const firstSection = sequence.sections[0]!; // "Main"
    const reorderResponse = await testContext.app.request(
      `${baseUrl()}/${seq.uuid}/sections/${firstSection.uuid}/position`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: 1 }),
      },
    );
    expect(reorderResponse.status).toBe(200);
    const bundle = (await reorderResponse.json()) as SequenceBundle;
    const reordered = bundle.sequences.find((s) => s.uuid === seq.uuid)!;
    // Original first section should now be at index 1
    expect(reordered.sections[1]?.uuid).toBe(firstSection.uuid);
    expect(reordered.sections[0]?.name).toBe("Act Two");

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=5`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    const logEntry = entries.find((e) => e.type === "sequence:section-reordered");
    expect(logEntry).toBeDefined();
    expect((logEntry!.payload as { sectionName: string }).sectionName).toBe(firstSection.name);
  });

  it("reorder section returns 404 for unknown section", async () => {
    const main = (await (
      await testContext.app.request(`${baseUrl()}/main`)
    ).json()) as SequenceFull;
    const response = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/sections/00000000-0000-0000-0000-000000000000/position`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: 0 }),
      },
    );
    expect(response.status).toBe(404);
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

    await testContext.app.request(`${baseUrl()}/${main.uuid}/positions/${placed.fragmentUuid}`, {
      method: "DELETE",
    });

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

describe("GET /projects/:projectId/sequences/:sequenceId/contents", () => {
  type FragmentContent = { fragmentUuid: string; key: string; content: string };
  type ContentsResponse = { placed: FragmentContent[]; pool: FragmentContent[] };

  // Self-contained: create a fresh sequence and two new fragments so the test
  // does not depend on placement state left behind by earlier tests in the file.
  const createFragment = async (key: string, content: string) => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, content }),
    });
    return (await response.json()) as { uuid: string };
  };

  it("returns placed fragments in sequence order plus the pool, with content", async () => {
    const firstContent = "The first fragment body.";
    const secondContent = "The second fragment body.";
    const first = await createFragment("contents-first", firstContent);
    const second = await createFragment("contents-second", secondContent);
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const createResponse = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Contents Test",
        isMain: false,
        projectUuid: project.projectUUID,
      }),
    });
    const createdBundle = (await createResponse.json()) as SequenceBundle;
    const sequence = createdBundle.sequences.find((s) => s.name === "Contents Test")!;
    const sectionUuid = sequence.sections[0]!.uuid;

    // Place in reversed order (second first) to prove the endpoint reflects
    // sequence position, not fragment-creation order.
    await testContext.app.request(`${baseUrl()}/${sequence.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: second.uuid, sectionUuid, position: 0 }),
    });
    await testContext.app.request(`${baseUrl()}/${sequence.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: first.uuid, sectionUuid, position: 1 }),
    });

    const response = await testContext.app.request(`${baseUrl()}/${sequence.uuid}/contents`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as ContentsResponse;

    // Placed: exactly the two fragments, in sequence order, with their content.
    expect(body.placed.map((entry) => entry.fragmentUuid)).toEqual([second.uuid, first.uuid]);
    expect(body.placed[0]!.content.trim()).toBe(secondContent);
    expect(body.placed[0]!.key).toBe("contents-second");
    expect(body.placed[1]!.content.trim()).toBe(firstContent);

    // Pool: excludes the placed fragments; every entry carries content.
    const poolUuids = body.pool.map((entry) => entry.fragmentUuid);
    expect(poolUuids).not.toContain(first.uuid);
    expect(poolUuids).not.toContain(second.uuid);
    expect(body.pool.every((entry) => typeof entry.content === "string")).toBe(true);
  });
});

describe("Phase 2 section operations", () => {
  const createFragment = async (key: string, content: string) => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, content }),
    });
    return (await response.json()) as { uuid: string };
  };

  const createSequenceWithSection = async (name: string) => {
    const createResponse = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isMain: false, projectUuid: project.projectUUID }),
    });
    const bundle = (await createResponse.json()) as SequenceBundle;
    const sequence = bundle.sequences.find((s) => s.name === name)!;
    return sequence;
  };

  const place = async (
    sequenceUuid: string,
    sectionUuid: string,
    fragmentUuid: string,
    position: number,
  ) => {
    await testContext.app.request(`${baseUrl()}/${sequenceUuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid, sectionUuid, position }),
    });
  };

  const fragmentOrder = (section: Section) =>
    [...section.fragments].sort((a, b) => a.position - b.position).map((f) => f.fragmentUuid);

  it("groups selected fragments into a new section in sequence order", async () => {
    const fa = await createFragment("p2-group-a", "A");
    const fb = await createFragment("p2-group-b", "B");
    const fc = await createFragment("p2-group-c", "C");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const sequence = await createSequenceWithSection("Group Test");
    const sectionUuid = sequence.sections[0]!.uuid;
    await place(sequence.uuid, sectionUuid, fa.uuid, 0);
    await place(sequence.uuid, sectionUuid, fb.uuid, 1);
    await place(sequence.uuid, sectionUuid, fc.uuid, 2);

    const response = await testContext.app.request(
      `${baseUrl()}/${sequence.uuid}/group-fragments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fragmentUuids: [fc.uuid, fa.uuid], name: "Grouped" }),
      },
    );
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === sequence.uuid)!;

    const grouped = updated.sections.find((s) => s.name === "Grouped")!;
    expect(fragmentOrder(grouped)).toEqual([fa.uuid, fc.uuid]);
    const original = updated.sections.find((s) => s.uuid === sectionUuid)!;
    expect(fragmentOrder(original)).toEqual([fb.uuid]);
  });

  it("moves selected fragments into an existing section as a block", async () => {
    const fa = await createFragment("p2-move-a", "A");
    const fb = await createFragment("p2-move-b", "B");
    const fc = await createFragment("p2-move-c", "C");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const sequence = await createSequenceWithSection("Move Test");
    const sectionOne = sequence.sections[0]!.uuid;
    await place(sequence.uuid, sectionOne, fa.uuid, 0);
    await place(sequence.uuid, sectionOne, fb.uuid, 1);

    // Add a second section and place fc there.
    const sectionBundle = (await (
      await testContext.app.request(`${baseUrl()}/${sequence.uuid}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Two" }),
      })
    ).json()) as SequenceBundle;
    const sectionTwo = sectionBundle.sequences
      .find((s) => s.uuid === sequence.uuid)!
      .sections.find((s) => s.name === "Two")!.uuid;
    await place(sequence.uuid, sectionTwo, fc.uuid, 0);

    const response = await testContext.app.request(`${baseUrl()}/${sequence.uuid}/move-fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragmentUuids: [fa.uuid, fb.uuid],
        sectionUuid: sectionTwo,
        position: 0,
      }),
    });
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === sequence.uuid)!;

    const target = updated.sections.find((s) => s.uuid === sectionTwo)!;
    expect(fragmentOrder(target)).toEqual([fa.uuid, fb.uuid, fc.uuid]);
    const source = updated.sections.find((s) => s.uuid === sectionOne)!;
    expect(fragmentOrder(source)).toEqual([]);
  });

  it("splits a section at a marked fragment", async () => {
    const fa = await createFragment("p2-split-a", "A");
    const fb = await createFragment("p2-split-b", "B");
    const fc = await createFragment("p2-split-c", "C");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const sequence = await createSequenceWithSection("Split Test");
    const sectionUuid = sequence.sections[0]!.uuid;
    await place(sequence.uuid, sectionUuid, fa.uuid, 0);
    await place(sequence.uuid, sectionUuid, fb.uuid, 1);
    await place(sequence.uuid, sectionUuid, fc.uuid, 2);

    const response = await testContext.app.request(`${baseUrl()}/${sequence.uuid}/split-section`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: fb.uuid, name: "Part Two" }),
    });
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === sequence.uuid)!;

    const original = updated.sections.find((s) => s.uuid === sectionUuid)!;
    expect(fragmentOrder(original)).toEqual([fa.uuid]);
    const partTwo = updated.sections.find((s) => s.name === "Part Two")!;
    expect(fragmentOrder(partTwo)).toEqual([fb.uuid, fc.uuid]);
    // The new section is inserted immediately after the original.
    const originalIndex = updated.sections.findIndex((s) => s.uuid === sectionUuid);
    expect(updated.sections[originalIndex + 1]!.uuid).toBe(partTwo.uuid);
  });

  it("logs the group operation with the section name and fragment count", async () => {
    const fa = await createFragment("p2-log-a", "A");
    const fb = await createFragment("p2-log-b", "B");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });
    const sequence = await createSequenceWithSection("Group Log Test");
    const sectionUuid = sequence.sections[0]!.uuid;
    await place(sequence.uuid, sectionUuid, fa.uuid, 0);
    await place(sequence.uuid, sectionUuid, fb.uuid, 1);

    await testContext.app.request(`${baseUrl()}/${sequence.uuid}/group-fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuids: [fa.uuid, fb.uuid], name: "Logged" }),
    });

    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    const entry = entries.find((e) => e.type === "sequence:fragments-grouped");
    expect(entry).toBeDefined();
    expect((entry!.payload as { sectionName: string; fragmentCount: number }).sectionName).toBe(
      "Logged",
    );
    expect((entry!.payload as { sectionName: string; fragmentCount: number }).fragmentCount).toBe(
      2,
    );
  });

  it("merges a section with the next one (inverse of split) via merge-next", async () => {
    const fa = await createFragment("p2-merge-a", "A");
    const fb = await createFragment("p2-merge-b", "B");
    const fc = await createFragment("p2-merge-c", "C");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const sequence = await createSequenceWithSection("Merge Test");
    const sectionUuid = sequence.sections[0]!.uuid;
    await place(sequence.uuid, sectionUuid, fa.uuid, 0);
    await place(sequence.uuid, sectionUuid, fb.uuid, 1);
    await place(sequence.uuid, sectionUuid, fc.uuid, 2);

    // Split before B → [A] [B, C], then merge the first section with the next.
    await testContext.app.request(`${baseUrl()}/${sequence.uuid}/split-section`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: fb.uuid, name: "Tail" }),
    });

    const response = await testContext.app.request(
      `${baseUrl()}/${sequence.uuid}/sections/${sectionUuid}/merge-next`,
      { method: "POST" },
    );
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === sequence.uuid)!;

    // Back to a single section with the original order.
    const survivor = updated.sections.find((s) => s.uuid === sectionUuid)!;
    expect(updated.sections.filter((s) => s.fragments.length > 0)).toHaveLength(1);
    expect(fragmentOrder(survivor)).toEqual([fa.uuid, fb.uuid, fc.uuid]);
  });
});

describe("Phase 3 clone / insert operations", () => {
  const createFragment = async (key: string, content: string) => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, content }),
    });
    return (await response.json()) as { uuid: string };
  };

  const createSequenceWithSection = async (name: string) => {
    const createResponse = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isMain: false, projectUuid: project.projectUUID }),
    });
    const bundle = (await createResponse.json()) as SequenceBundle;
    return bundle.sequences.find((s) => s.name === name)!;
  };

  const place = async (
    sequenceUuid: string,
    sectionUuid: string,
    fragmentUuid: string,
    position: number,
  ) => {
    await testContext.app.request(`${baseUrl()}/${sequenceUuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid, sectionUuid, position }),
    });
  };

  const fragmentOrder = (section: Section) =>
    [...section.fragments].sort((a, b) => a.position - b.position).map((f) => f.fragmentUuid);

  it("clones a sequence into a fresh independent copy with no uuid collisions", async () => {
    const fa = await createFragment("p3-clone-a", "A");
    const fb = await createFragment("p3-clone-b", "B");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const source = await createSequenceWithSection("Clone Source");
    const sectionUuid = source.sections[0]!.uuid;
    await place(source.uuid, sectionUuid, fa.uuid, 0);
    await place(source.uuid, sectionUuid, fb.uuid, 1);

    const response = await testContext.app.request(`${baseUrl()}/${source.uuid}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Clone Copy" }),
    });
    expect(response.status).toBe(201);
    const bundle = (await response.json()) as SequenceBundle;

    const clone = bundle.sequences.find((s) => s.name === "Clone Copy")!;
    expect(clone).toBeDefined();
    expect(clone.uuid).not.toBe(source.uuid);
    expect(clone.isMain).toBe(false);
    // Placements preserved.
    const cloneSection = clone.sections[0]!;
    expect(fragmentOrder(cloneSection)).toEqual([fa.uuid, fb.uuid]);
    // Section and position uuids regenerated.
    expect(cloneSection.uuid).not.toBe(sectionUuid);
    const sourceFresh = bundle.sequences.find((s) => s.uuid === source.uuid)!;
    const sourcePositionUuids = new Set(
      sourceFresh.sections.flatMap((s) => s.fragments.map((f) => f.uuid)),
    );
    for (const fragment of cloneSection.fragments) {
      expect(sourcePositionUuids.has(fragment.uuid)).toBe(false);
    }
  });

  it("logs the clone operation with the source name", async () => {
    const source = await createSequenceWithSection("Clone Log Source");
    await testContext.app.request(`${baseUrl()}/${source.uuid}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Clone Log Copy" }),
    });
    const logResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/action-log?limit=10`,
    );
    const entries = (await logResponse.json()) as LogEntry[];
    const entry = entries.find((e) => e.type === "sequence:cloned");
    expect(entry).toBeDefined();
    expect((entry!.payload as { sourceName: string }).sourceName).toBe("Clone Log Source");
  });

  it("inserts a source sequence's sections into a target at the given index", async () => {
    const fa = await createFragment("p3-insert-a", "A");
    const fb = await createFragment("p3-insert-b", "B");
    const fc = await createFragment("p3-insert-c", "C");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const target = await createSequenceWithSection("Insert Target");
    const targetSection = target.sections[0]!.uuid;
    await place(target.uuid, targetSection, fa.uuid, 0);

    const sourceSeq = await createSequenceWithSection("Insert Source");
    const sourceSection = sourceSeq.sections[0]!.uuid;
    await place(sourceSeq.uuid, sourceSection, fb.uuid, 0);
    await place(sourceSeq.uuid, sourceSection, fc.uuid, 1);

    const response = await testContext.app.request(`${baseUrl()}/${target.uuid}/insert-sequence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceSequenceId: sourceSeq.uuid, sectionIndex: 0 }),
    });
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === target.uuid)!;

    // Inserted section prepended; flattened order is [B, C, A].
    const flat = updated.sections.flatMap(fragmentOrder);
    expect(flat).toEqual([fb.uuid, fc.uuid, fa.uuid]);
    // Source is untouched.
    const sourceFresh = bundle.sequences.find((s) => s.uuid === sourceSeq.uuid)!;
    expect(sourceFresh.sections.flatMap(fragmentOrder)).toEqual([fb.uuid, fc.uuid]);
  });

  it("skips fragments already placed in the target when inserting", async () => {
    const shared = await createFragment("p3-insert-shared", "shared");
    const only = await createFragment("p3-insert-only", "only");
    await testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, {
      method: "POST",
    });

    const target = await createSequenceWithSection("Insert Dedup Target");
    const targetSection = target.sections[0]!.uuid;
    await place(target.uuid, targetSection, shared.uuid, 0);

    const sourceSeq = await createSequenceWithSection("Insert Dedup Source");
    const sourceSection = sourceSeq.sections[0]!.uuid;
    await place(sourceSeq.uuid, sourceSection, shared.uuid, 0);
    await place(sourceSeq.uuid, sourceSection, only.uuid, 1);

    const response = await testContext.app.request(`${baseUrl()}/${target.uuid}/insert-sequence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceSequenceId: sourceSeq.uuid, sectionIndex: 1 }),
    });
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as SequenceBundle;
    const updated = bundle.sequences.find((s) => s.uuid === target.uuid)!;

    // shared stays in its original target slot; only `only` is inserted.
    const flat = updated.sections.flatMap(fragmentOrder);
    expect(flat).toEqual([shared.uuid, only.uuid]);
    const occurrences = flat.filter((uuid) => uuid === shared.uuid);
    expect(occurrences).toHaveLength(1);
  });
});

describe("import-sequence read-only enforcement", () => {
  // A sequence carrying an `origin` is an import-sequence: frozen. The backend
  // must reject every placement / section-structure mutation regardless of the
  // UI. The sequencer-level guard is exercised exhaustively in the sequencer
  // package; here we assert every mutating route maps the rejection to
  // `409 { reason: "sequence_read_only" }`.
  let importSequence: SequenceFull;
  let fragmentUuid: string;
  let sectionId: string;

  beforeAll(async () => {
    const bundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Imported — read-only",
          isMain: false,
          projectUuid: project.projectUUID,
          origin: {
            fileName: "draft.md",
            archivePath: ".maskor/imports/draft.md",
            format: "markdown",
            importedAt: "2026-06-13T00:00:00.000Z",
          },
        }),
      })
    ).json()) as SequenceBundle;
    importSequence = bundle.sequences.find((s) => s.name === "Imported — read-only")!;
    sectionId = importSequence.sections[0]!.uuid;

    const summaries = (await (
      await testContext.app.request(`/projects/${project.projectUUID}/fragments/summaries`)
    ).json()) as Array<{ uuid: string }>;
    const fragment = summaries[0];
    if (!fragment) throw new Error("expected at least one seeded fragment");
    fragmentUuid = fragment.uuid;
  });

  // Each mutating route, with a body that passes request-schema validation so the
  // handler reaches the read-only guard. Built lazily because they depend on the
  // sequence/section/fragment ids resolved in beforeAll.
  const mutatingRequests = (): {
    name: string;
    path: string;
    method: string;
    body?: unknown;
  }[] => [
    {
      name: "place-fragment",
      method: "POST",
      path: `${baseUrl()}/${importSequence.uuid}/positions`,
      body: { fragmentUuid, sectionUuid: sectionId, position: 0 },
    },
    {
      name: "move-fragment",
      method: "PATCH",
      path: `${baseUrl()}/${importSequence.uuid}/positions/${fragmentUuid}`,
      body: { sectionUuid: sectionId, position: 0 },
    },
    {
      name: "unplace-fragment",
      method: "DELETE",
      path: `${baseUrl()}/${importSequence.uuid}/positions/${fragmentUuid}`,
    },
    {
      name: "create-section",
      method: "POST",
      path: `${baseUrl()}/${importSequence.uuid}/sections`,
      body: { name: "New section" },
    },
    {
      name: "rename-section",
      method: "PATCH",
      path: `${baseUrl()}/${importSequence.uuid}/sections/${sectionId}`,
      body: { name: "Renamed" },
    },
    {
      name: "reorder-section",
      method: "PATCH",
      path: `${baseUrl()}/${importSequence.uuid}/sections/${sectionId}/position`,
      body: { position: 0 },
    },
    {
      name: "delete-section",
      method: "DELETE",
      path: `${baseUrl()}/${importSequence.uuid}/sections/${sectionId}`,
    },
    {
      name: "group-fragments",
      method: "POST",
      path: `${baseUrl()}/${importSequence.uuid}/group-fragments`,
      body: { fragmentUuids: [fragmentUuid], name: "Grouped" },
    },
    {
      name: "move-fragments",
      method: "POST",
      path: `${baseUrl()}/${importSequence.uuid}/move-fragments`,
      body: { fragmentUuids: [fragmentUuid], sectionUuid: sectionId, position: 0 },
    },
    {
      name: "split-section",
      method: "POST",
      path: `${baseUrl()}/${importSequence.uuid}/split-section`,
      body: { fragmentUuid, name: "Split" },
    },
    {
      name: "merge-section",
      method: "POST",
      path: `${baseUrl()}/${importSequence.uuid}/sections/${sectionId}/merge-next`,
    },
  ];

  it("rejects every mutating route with 409 sequence_read_only", async () => {
    for (const request of mutatingRequests()) {
      const response = await testContext.app.request(request.path, {
        method: request.method,
        ...(request.body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request.body),
            }
          : {}),
      });

      expect(response.status, `${request.name} should be rejected`).toBe(409);
      const body = (await response.json()) as { reason?: string };
      expect(body.reason, `${request.name} should report sequence_read_only`).toBe(
        "sequence_read_only",
      );
    }
  });
});

describe("POST /projects/:projectId/sequences/generate — shuffle", () => {
  const createFragment = async (key: string, content: string) => {
    const response = await testContext.app.request(`/projects/${project.projectUUID}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, content }),
    });
    return (await response.json()) as { uuid: string };
  };

  const rebuildIndex = () =>
    testContext.app.request(`/projects/${project.projectUUID}/index/rebuild`, { method: "POST" });

  const createSecondary = async (name: string) => {
    const response = await testContext.app.request(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isMain: false, projectUuid: project.projectUUID }),
    });
    const bundle = (await response.json()) as SequenceBundle;
    return bundle.sequences.find((s) => s.name === name)!;
  };

  const place = async (
    sequenceUuid: string,
    sectionUuid: string,
    fragmentUuid: string,
    position: number,
  ) => {
    await testContext.app.request(`${baseUrl()}/${sequenceUuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid, sectionUuid, position }),
    });
  };

  const generate = (body: Record<string, unknown>) =>
    testContext.app.request(`${baseUrl()}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const flatOrder = (sequence: SequenceFull) =>
    [...sequence.sections[0]!.fragments]
      .sort((a, b) => a.position - b.position)
      .map((f) => f.fragmentUuid);

  it("generates a non-main single-section sequence containing the created fragments", async () => {
    const fa = await createFragment("shuffle-a", "A");
    const fb = await createFragment("shuffle-b", "B");
    await rebuildIndex();

    const response = await generate({ name: "Shuffle Test 1", constraintSequenceIds: [] });
    expect(response.status).toBe(201);
    const bundle = (await response.json()) as SequenceBundle;
    const generated = bundle.sequences.find((s) => s.name === "Shuffle Test 1")!;

    expect(generated).toBeDefined();
    expect(generated.isMain).toBe(false);
    expect(generated.active).toBe(false);
    expect(generated.sections).toHaveLength(1);
    const order = flatOrder(generated);
    expect(order).toContain(fa.uuid);
    expect(order).toContain(fb.uuid);
  });

  it("honors the ordering of a chosen constraint sequence", async () => {
    const first = await createFragment("shuffle-order-first", "first");
    const second = await createFragment("shuffle-order-second", "second");
    await rebuildIndex();

    const constraint = await createSecondary("Shuffle Constraint");
    const sectionUuid = constraint.sections[0]!.uuid;
    await place(constraint.uuid, sectionUuid, first.uuid, 0);
    await place(constraint.uuid, sectionUuid, second.uuid, 1);

    // Run several times — the constraint must hold every time.
    for (let run = 0; run < 5; run++) {
      const response = await generate({
        name: `Shuffle Ordered ${run}`,
        constraintSequenceIds: [constraint.uuid],
      });
      expect(response.status).toBe(201);
      const bundle = (await response.json()) as SequenceBundle;
      const generated = bundle.sequences.find((s) => s.name === `Shuffle Ordered ${run}`)!;
      const order = flatOrder(generated);
      expect(order.indexOf(first.uuid)).toBeLessThan(order.indexOf(second.uuid));
    }
  });

  it("returns 409 constraint_cycle when the chosen constraints contradict each other", async () => {
    const fa = await createFragment("shuffle-cycle-a", "A");
    const fb = await createFragment("shuffle-cycle-b", "B");
    await rebuildIndex();

    const forward = await createSecondary("Cycle Forward");
    const forwardSection = forward.sections[0]!.uuid;
    await place(forward.uuid, forwardSection, fa.uuid, 0);
    await place(forward.uuid, forwardSection, fb.uuid, 1);

    const backward = await createSecondary("Cycle Backward");
    const backwardSection = backward.sections[0]!.uuid;
    await place(backward.uuid, backwardSection, fb.uuid, 0);
    await place(backward.uuid, backwardSection, fa.uuid, 1);

    const response = await generate({
      name: "Shuffle Cycle",
      constraintSequenceIds: [forward.uuid, backward.uuid],
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      reason?: string;
      cycles?: { fragmentUuids: string[] }[];
    };
    expect(body.reason).toBe("constraint_cycle");
    expect(body.cycles!.length).toBeGreaterThan(0);

    // Nothing was created.
    const listResponse = await testContext.app.request(baseUrl());
    const listBundle = (await listResponse.json()) as SequenceBundle;
    expect(listBundle.sequences.find((s) => s.name === "Shuffle Cycle")).toBeUndefined();
  });

  it("returns 404 when a chosen constraint sequence does not exist", async () => {
    await createFragment("shuffle-missing-a", "A");
    await rebuildIndex();

    // Syntactically valid v4 uuid (passes the schema) that no sequence owns.
    const missingUuid = "deadbeef-0000-4000-8000-0000000000ff";
    const response = await generate({
      name: "Shuffle Missing",
      constraintSequenceIds: [missingUuid],
    });
    expect(response.status).toBe(404);

    // Nothing was created.
    const listResponse = await testContext.app.request(baseUrl());
    const listBundle = (await listResponse.json()) as SequenceBundle;
    expect(listBundle.sequences.find((s) => s.name === "Shuffle Missing")).toBeUndefined();
  });
});
