import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { IndexedFragment } from "@maskor/storage";

type SuggestionNextResponse = {
  fragment: { uuid: string; readiness: number; isDiscarded: boolean } | null;
  avoidanceCount: number;
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

describe("GET /projects/:projectId/suggestion/next", () => {
  it("returns a fragment from the eligible pool", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/suggestion/next`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SuggestionNextResponse;
    expect(body.fragment).not.toBeNull();
    expect(typeof body.avoidanceCount).toBe("number");
  });

  it("returned fragment is not discarded and has readiness < 1.0", async () => {
    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/suggestion/next`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SuggestionNextResponse;
    if (body.fragment) {
      expect(body.fragment.isDiscarded).toBe(false);
      expect(body.fragment.readiness).toBeLessThan(1.0);
    }
  });

  it("excludes finished fragments (readiness === 1.0) from the pool", async () => {
    const listResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const active = fragments.filter((f) => !f.isDiscarded);

    // Set all but one to readiness 1.0
    const toFinish = active.slice(0, active.length - 1);
    for (const fragment of toFinish) {
      await testContext.app.request(`/projects/${project.projectUUID}/fragments/${fragment.uuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readiness: 1.0 }),
      });
    }

    const nextResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/suggestion/next`,
    );
    expect(nextResponse.status).toBe(200);
    const body = (await nextResponse.json()) as SuggestionNextResponse;
    if (body.fragment) {
      const finishedUuids = new Set(toFinish.map((f) => f.uuid));
      expect(finishedUuids.has(body.fragment.uuid)).toBe(false);
    }
  });

  it("returns { fragment: null } when all non-discarded fragments are finished", async () => {
    // Create a fresh project with a single finished fragment
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;

    const listResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const active = fragments.filter((f) => !f.isDiscarded);

    for (const fragment of active) {
      await freshContext.app.request(
        `/projects/${freshProject.projectUUID}/fragments/${fragment.uuid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ readiness: 1.0 }),
        },
      );
    }

    const nextResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next`,
    );
    expect(nextResponse.status).toBe(200);
    const body = (await nextResponse.json()) as SuggestionNextResponse;
    expect(body.fragment).toBeNull();

    await freshContext.cleanup();
  });
});

describe("GET /projects/:projectId/suggestion/current", () => {
  it("returns null when no suggestion has been fetched yet", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;

    const response = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/current`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { fragment: null; avoidanceCount: number };
    expect(body.fragment).toBeNull();

    await freshContext.cleanup();
  });

  it("pointer persists across requests — current returns the same fragment getNext returned", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;

    const nextResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next`,
    );
    expect(nextResponse.status).toBe(200);
    const nextBody = (await nextResponse.json()) as SuggestionNextResponse;
    expect(nextBody.fragment).not.toBeNull();
    const nextUuid = nextBody.fragment!.uuid;

    const currentResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/current`,
    );
    expect(currentResponse.status).toBe(200);
    const currentBody = (await currentResponse.json()) as SuggestionNextResponse;
    expect(currentBody.fragment).not.toBeNull();
    expect(currentBody.fragment!.uuid).toBe(nextUuid);

    await freshContext.cleanup();
  });
});

describe("PUT /projects/:projectId/suggestion/current", () => {
  it("sets the current pointer — getCurrent returns the fragment passed to setCurrent", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;

    const listResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const active = fragments.filter((f) => !f.isDiscarded);
    expect(active.length).toBeGreaterThanOrEqual(2);

    const fragmentA = active[0]!;
    const fragmentB = active[1]!;

    // getNext sets the pointer to one fragment (could be A or B)
    const nextResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next`,
    );
    expect(nextResponse.status).toBe(200);
    const nextBody = (await nextResponse.json()) as SuggestionNextResponse;
    expect(nextBody.fragment).not.toBeNull();
    const nextUuid = nextBody.fragment!.uuid;

    // Pick a fragment different from what getNext returned (simulates back-nav to a previous one)
    const backNavFragment = nextUuid === fragmentA.uuid ? fragmentB : fragmentA;

    // setCurrentSuggestion: simulate the frontend syncing the pointer after back-navigation
    const setResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/current`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fragmentId: backNavFragment.uuid }),
      },
    );
    expect(setResponse.status).toBe(204);

    // getCurrent must return the back-nav fragment, not the one getNext had returned
    const currentResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/current`,
    );
    expect(currentResponse.status).toBe(200);
    const currentBody = (await currentResponse.json()) as SuggestionNextResponse;
    expect(currentBody.fragment).not.toBeNull();
    expect(currentBody.fragment!.uuid).toBe(backNavFragment.uuid);

    await freshContext.cleanup();
  });
});

describe("POST /projects/:projectId/suggestion/visit/:fragmentId", () => {
  it("returns 204", async () => {
    const listResponse = await testContext.app.request(
      `/projects/${project.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const fragment = fragments[0]!;

    const response = await testContext.app.request(
      `/projects/${project.projectUUID}/suggestion/visit/${fragment.uuid}`,
      { method: "POST" },
    );
    expect(response.status).toBe(204);
  });
});

describe("POST /projects/:projectId/suggestion/pick/:fragmentId", () => {
  it("returns 204 and bumps voluntary_open_count", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;
    const projectContext = await freshContext.storageService.resolveProject(
      freshProject.projectUUID,
    );

    const listResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const fragment = fragments[0]!;

    const before = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      fragment.uuid,
    );

    const response = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/pick/${fragment.uuid}`,
      { method: "POST" },
    );
    expect(response.status).toBe(204);

    const after = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      fragment.uuid,
    );
    expect(after.voluntaryOpenCount).toBe(before.voluntaryOpenCount + 1);

    await freshContext.cleanup();
  });

  it("a picked fragment is excluded from the next selection (cooldown applied)", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;

    const listResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const active = fragments.filter((fragment) => !fragment.isDiscarded);
    expect(active.length).toBeGreaterThan(1);
    const pickedUuid = active[0]!.uuid;

    await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/pick/${pickedUuid}`,
      { method: "POST" },
    );

    // Call getNext with NO exclude. Because the picked fragment is in cooldown
    // and other eligible fragments exist, the engine must not return it on
    // this fresh call. (Cooldown's all-cooled fallback only kicks in once
    // every eligible fragment has been cooled — which is not the case here.)
    const response = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SuggestionNextResponse;
    expect(body.fragment).not.toBeNull();
    expect(body.fragment!.uuid).not.toBe(pickedUuid);

    await freshContext.cleanup();
  });

  it("avoidance_count is NOT incremented when Next is pressed after a pick", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;
    const projectContext = await freshContext.storageService.resolveProject(
      freshProject.projectUUID,
    );

    const listResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const pickedUuid = fragments.find((fragment) => !fragment.isDiscarded)!.uuid;

    await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/pick/${pickedUuid}`,
      { method: "POST" },
    );

    // Now press Next with the picked fragment as excludeUuid — simulates user
    // picking a fragment via quick-switcher then skipping with Next.
    const nextResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next?exclude=${pickedUuid}`,
    );
    expect(nextResponse.status).toBe(200);

    const stats = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      pickedUuid,
    );
    expect(stats.avoidanceCount).toBe(0);

    await freshContext.cleanup();
  });
});

describe("editCount — session-scoped increment", () => {
  it("no-op save does not increment editCount", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;
    const projectContext = await freshContext.storageService.resolveProject(
      freshProject.projectUUID,
    );

    const listResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const fragment = fragments.find((f) => !f.isDiscarded)!;

    // Fetch first suggestion to start a session
    const nextResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next`,
    );
    expect(nextResponse.status).toBe(200);

    const before = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      fragment.uuid,
    );

    // PATCH with the same content (no change)
    const getResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments/${fragment.uuid}`,
    );
    const existing = (await getResponse.json()) as { content: string };

    await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: existing.content }),
      },
    );

    const after = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      fragment.uuid,
    );
    expect(after.editCount).toBe(before.editCount);

    await freshContext.cleanup();
  });

  it("changed save increments editCount by 1", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;
    const projectContext = await freshContext.storageService.resolveProject(
      freshProject.projectUUID,
    );

    const listResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const fragment = fragments.find((f) => !f.isDiscarded)!;

    // Surface the fragment
    await freshContext.app.request(`/projects/${freshProject.projectUUID}/suggestion/next`);

    const before = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      fragment.uuid,
    );

    await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Changed content for editCount test." }),
      },
    );

    const after = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      fragment.uuid,
    );
    expect(after.editCount).toBe(before.editCount + 1);

    await freshContext.cleanup();
  });

  it("repeated changed saves within one session increment editCount only once", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;
    const projectContext = await freshContext.storageService.resolveProject(
      freshProject.projectUUID,
    );

    const listResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments`,
    );
    const fragments = (await listResponse.json()) as IndexedFragment[];
    const fragment = fragments.find((f) => !f.isDiscarded)!;

    // Pick the specific fragment to guarantee it has a cooldown/session entry
    await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/pick/${fragment.uuid}`,
      { method: "POST" },
    );

    const before = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      fragment.uuid,
    );

    // Three distinct saves in one session
    await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "First save in session." }),
      },
    );
    await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Second save in session." }),
      },
    );
    await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/fragments/${fragment.uuid}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Third save in session." }),
      },
    );

    const after = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      fragment.uuid,
    );
    expect(after.editCount).toBe(before.editCount + 1);

    await freshContext.cleanup();
  });
});

describe("GET /suggestion/next — avoidance_count increment", () => {
  it("increments avoidance_count when Next is called without editing", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;
    const projectContext = await freshContext.storageService.resolveProject(
      freshProject.projectUUID,
    );

    // Get the first suggestion
    const firstResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next`,
    );
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()) as SuggestionNextResponse;
    expect(first.fragment).not.toBeNull();
    const firstUuid = first.fragment!.uuid;

    // Call next with exclude (no edit in between) — should increment avoidance
    const secondResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next?exclude=${firstUuid}`,
    );
    expect(secondResponse.status).toBe(200);

    // Verify the avoidance_count was actually incremented in storage.
    const stats = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      firstUuid,
    );
    expect(stats.avoidanceCount).toBe(1);

    await freshContext.cleanup();
  });

  it("does not increment avoidance_count when fragment was edited before Next", async () => {
    const freshContext = createTestApp();
    const seeded = await seedVault(freshContext.storageService, freshContext.temporaryDirectory);
    const freshProject = seeded.project;
    const projectContext = await freshContext.storageService.resolveProject(
      freshProject.projectUUID,
    );

    // Get the first suggestion
    const firstResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next`,
    );
    const first = (await firstResponse.json()) as SuggestionNextResponse;
    const firstUuid = first.fragment!.uuid;

    // Edit the fragment (this calls PATCH which increments edit_count and marks edited in cooldown)
    await freshContext.app.request(`/projects/${freshProject.projectUUID}/fragments/${firstUuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Updated content to mark as edited." }),
    });

    // Call next with exclude — avoidance should NOT be incremented because it was edited
    const secondResponse = await freshContext.app.request(
      `/projects/${freshProject.projectUUID}/suggestion/next?exclude=${firstUuid}`,
    );
    expect(secondResponse.status).toBe(200);

    // Verify avoidance_count remains 0 in storage.
    const stats = freshContext.storageService.suggestion.getFragmentStats(
      projectContext,
      firstUuid,
    );
    expect(stats.avoidanceCount).toBe(0);

    await freshContext.cleanup();
  });
});
