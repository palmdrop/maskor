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

afterAll(() => {
  testContext.cleanup();
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
    expect(mainInBundle.sections[0]!.fragments.some((f) => f.fragmentUuid === placed.fragmentUuid)).toBe(false);
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

    const response = await testContext.app.request(
      `${baseUrl()}/${main.uuid}/designate-main`,
      { method: "POST" },
    );
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
      body: JSON.stringify({ fragmentUuid: fragA.uuid, sectionUuid: main.sections[0]!.uuid, position: 0 }),
    });
    await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: fragB.uuid, sectionUuid: main.sections[0]!.uuid, position: 1 }),
    });

    const secBundle = (await (
      await testContext.app.request(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Violation Secondary", isMain: false, projectUuid: project.projectUUID }),
      })
    ).json()) as SequenceBundle;
    const sec = secBundle.sequences.find((s) => s.name === "Violation Secondary")!;

    await testContext.app.request(`${baseUrl()}/${sec.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: fragB.uuid, sectionUuid: sec.sections[0]!.uuid, position: 0 }),
    });
    const placeBundle = (await (
      await testContext.app.request(`${baseUrl()}/${sec.uuid}/positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fragmentUuid: fragA.uuid, sectionUuid: sec.sections[0]!.uuid, position: 1 }),
      })
    ).json()) as SequenceBundle;

    const violation = placeBundle.violations.find(
      (v) => v.secondaryUuid === sec.uuid,
    );
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
      (f) => !updatedMain.sections.some((s) => s.fragments.some((fp) => fp.fragmentUuid === f.uuid)),
    );
    if (!unplaced) return;

    const placeResponse = await testContext.app.request(`${baseUrl()}/${main.uuid}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentUuid: unplaced.uuid, sectionUuid: newSection.uuid, position: 0 }),
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
        body: JSON.stringify({ name: "Section Test Secondary", isMain: false, projectUuid: project.projectUUID }),
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
