import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

type AssembledFragment = { uuid: string; key: string; content: string };
type AssembledSection = { uuid: string; name: string; fragments: AssembledFragment[] };
type AssembledSequence = {
  sequenceUuid: string;
  sequenceName: string;
  isMain: boolean;
  sections: AssembledSection[];
};

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;
let mainSequenceUuid: string;

const previewUrl = (sequenceId: string) => `/projects/${project.projectUUID}/preview/${sequenceId}`;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;

  // Ensure a main sequence exists via the API (auto-creates one if absent)
  const mainResp = await testContext.app.request(`/projects/${project.projectUUID}/sequences/main`);
  const mainSeq = (await mainResp.json()) as { uuid: string };
  mainSequenceUuid = mainSeq.uuid;
});

afterAll(() => {
  testContext.cleanup();
});

describe("GET /projects/:projectId/preview/:sequenceId", () => {
  it("returns 200 assembled sequence for an empty sequence", async () => {
    const response = await testContext.app.request(previewUrl(mainSequenceUuid));
    expect(response.status).toBe(200);
    const body = (await response.json()) as AssembledSequence;
    expect(body.sequenceUuid).toBe(mainSequenceUuid);
    expect(body.isMain).toBe(true);
    expect(Array.isArray(body.sections)).toBe(true);
  });

  it("returns 404 for a nonexistent sequence UUID", async () => {
    const response = await testContext.app.request(
      previewUrl("00000000-0000-0000-0000-000000000000"),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("NOT_FOUND");
  });

  it("includes placed fragments in assembly", async () => {
    const context = await testContext.storageService.resolveProject(project.projectUUID);

    const fragments = await testContext.storageService.fragments.readAll(context);
    const liveFragment = fragments.find((f) => !f.isDiscarded);
    if (!liveFragment) return;

    const sequence = await testContext.storageService.sequences.read(context, mainSequenceUuid);
    const sectionUuid = sequence.sections[0]!.uuid;

    await testContext.app.request(
      `/projects/${project.projectUUID}/sequences/${mainSequenceUuid}/positions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fragmentUuid: liveFragment.uuid,
          sectionUuid,
          position: 0,
        }),
      },
    );

    const response = await testContext.app.request(previewUrl(mainSequenceUuid));
    expect(response.status).toBe(200);
    const body = (await response.json()) as AssembledSequence;
    const allFragments = body.sections.flatMap((s) => s.fragments);
    const found = allFragments.find((f) => f.uuid === liveFragment.uuid);
    expect(found).toBeDefined();
    expect(found?.key).toBe(liveFragment.key);
    expect(typeof found?.content).toBe("string");
  });
});

describe("GET /projects/:projectId/preview/:sequenceId", () => {
  it("returns 404 when project does not exist", async () => {
    const response = await testContext.app.request(
      `/projects/00000000-0000-0000-0000-000000000000/preview/${mainSequenceUuid}`,
    );
    expect(response.status).toBe(404);
  });
});
