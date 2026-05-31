import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";

type PreviewNavFragment = { uuid: string; key: string };
type PreviewNavSection = { uuid: string; name: string; fragments: PreviewNavFragment[] };
type PreviewResult = { markdown: string; sections: PreviewNavSection[] };

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;
let mainSequenceUuid: string;

const previewUrl = (sequenceId: string, query = "") =>
  `/projects/${project.projectUUID}/preview/${sequenceId}${query}`;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;

  const mainResp = await testContext.app.request(`/projects/${project.projectUUID}/sequences/main`);
  const mainSeq = (await mainResp.json()) as { uuid: string };
  mainSequenceUuid = mainSeq.uuid;
});

afterAll(async () => {
  await testContext.cleanup();
});

describe("GET /projects/:projectId/preview/:sequenceId", () => {
  it("returns 200 with markdown + lean sections for an empty sequence", async () => {
    const response = await testContext.app.request(previewUrl(mainSequenceUuid));
    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewResult;
    expect(typeof body.markdown).toBe("string");
    expect(Array.isArray(body.sections)).toBe(true);
    // Lean nav carries no `content` field.
    for (const section of body.sections) {
      for (const fragment of section.fragments) {
        expect(fragment).not.toHaveProperty("content");
      }
    }
  });

  it("returns 404 for a nonexistent sequence UUID", async () => {
    const response = await testContext.app.request(
      previewUrl("00000000-0000-0000-0000-000000000000"),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("NOT_FOUND");
  });

  it("returns 404 when project does not exist", async () => {
    const response = await testContext.app.request(
      `/projects/00000000-0000-0000-0000-000000000000/preview/${mainSequenceUuid}`,
    );
    expect(response.status).toBe(404);
  });

  it("includes a placed fragment in markdown + nav, with an anchor sentinel", async () => {
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
        body: JSON.stringify({ fragmentUuid: liveFragment.uuid, sectionUuid, position: 0 }),
      },
    );

    const response = await testContext.app.request(previewUrl(mainSequenceUuid));
    expect(response.status).toBe(200);
    const body = (await response.json()) as PreviewResult;

    const navFragment = body.sections
      .flatMap((s) => s.fragments)
      .find((f) => f.uuid === liveFragment.uuid);
    expect(navFragment).toBeDefined();
    expect(navFragment?.key).toBe(liveFragment.key);

    // Anchors are on for preview: the markdown carries a sentinel encoding the uuid.
    expect(body.markdown).toContain(liveFragment.uuid);
  });

  it("drives output from toggle options (titles + separator)", async () => {
    const withTitlesRule = await testContext.app.request(
      previewUrl(mainSequenceUuid, "?showTitles=true&separator=horizontal-rule"),
    );
    const withoutTitles = await testContext.app.request(
      previewUrl(mainSequenceUuid, "?showTitles=false&separator=none"),
    );
    expect(withTitlesRule.status).toBe(200);
    expect(withoutTitles.status).toBe(200);

    const context = await testContext.storageService.resolveProject(project.projectUUID);
    const fragments = await testContext.storageService.fragments.readAll(context);
    const liveFragment = fragments.find((f) => !f.isDiscarded);
    if (!liveFragment) return;

    const withTitlesBody = (await withTitlesRule.json()) as PreviewResult;
    const withoutTitlesBody = (await withoutTitles.json()) as PreviewResult;

    // Title heading appears only when showTitles is on.
    expect(withTitlesBody.markdown).toContain(`### ${liveFragment.key}`);
    expect(withoutTitlesBody.markdown).not.toContain(`### ${liveFragment.key}`);
  });
});
