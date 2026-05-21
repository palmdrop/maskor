import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createTestApp } from "../helpers/create-test-app";

let testContext: ReturnType<typeof createTestApp>;
let vaultCounter = 0;

// Plain empty directory — each registration gets a fresh UUID with no manifest conflict.
const makeVaultDirectory = (): string => {
  vaultCounter += 1;
  const directory = join(testContext.temporaryDirectory, `vault-${vaultCounter}`);
  mkdirSync(directory, { recursive: true });
  return directory;
};

// Directory with an explicit project.json, for UUID-reuse tests.
const makeVaultDirectoryWithManifest = (projectUUID: string): string => {
  vaultCounter += 1;
  const directory = join(testContext.temporaryDirectory, `vault-${vaultCounter}`);
  mkdirSync(join(directory, ".maskor"), { recursive: true });
  writeFileSync(
    join(directory, ".maskor", "project.json"),
    JSON.stringify({
      projectUUID,
      name: "Manifest Project",
      registeredAt: new Date().toISOString(),
    }),
  );
  return directory;
};

beforeAll(() => {
  testContext = createTestApp();
});

afterAll(() => {
  testContext.cleanup();
});

describe("GET /projects", () => {
  it("returns empty list when no projects registered", async () => {
    const response = await testContext.app.request("/projects");
    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("POST /projects", () => {
  it("registers a project and returns 201 with the created record", async () => {
    const vaultDirectory = makeVaultDirectory();
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Project", vaultPath: vaultDirectory, mode: "adopt" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      name: string;
      vaultPath: string;
      projectUUID: string;
    };
    expect(body.name).toBe("My Project");
    expect(body.vaultPath).toBe(vaultDirectory);
    expect(body.projectUUID).toBeDefined();
  });

  it("reuses manifest UUID when adopting a vault with existing project.json", async () => {
    const knownUUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const vaultDirectory = makeVaultDirectoryWithManifest(knownUUID);
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Adopted Project", vaultPath: vaultDirectory, mode: "adopt" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { projectUUID: string };
    expect(body.projectUUID).toBe(knownUUID);
  });

  it("returns 409 when vaultPath is already registered", async () => {
    const vaultDirectory = makeVaultDirectory();
    await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "First", vaultPath: vaultDirectory, mode: "adopt" }),
    });

    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Second", vaultPath: vaultDirectory, mode: "adopt" }),
    });
    expect(response.status).toBe(409);
  });

  it("returns 400 when mode is missing", async () => {
    const vaultDirectory = makeVaultDirectory();
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Mode Project", vaultPath: vaultDirectory }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    const vaultDirectory = makeVaultDirectory();
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaultPath: vaultDirectory, mode: "adopt" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 when vaultPath is missing", async () => {
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Missing vault", mode: "adopt" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 when vaultPath is not absolute", async () => {
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Relative Path Project",
        vaultPath: "relative/path/to/vault",
        mode: "adopt",
      }),
    });
    expect(response.status).toBe(400);
  });
});

describe("GET /projects/:projectId", () => {
  it("returns 404 for an unknown project UUID", async () => {
    const response = await testContext.app.request(
      "/projects/00000000-0000-0000-0000-000000000000",
    );
    expect(response.status).toBe(404);
  });

  it("returns the full project record including name for a known UUID", async () => {
    const vaultDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Lookup Project", vaultPath: vaultDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const response = await testContext.app.request(`/projects/${projectUUID}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      projectUUID: string;
      name: string;
      vaultPath: string;
    };
    expect(body.projectUUID).toBe(projectUUID);
    expect(body.name).toBe("Lookup Project");
    expect(body.vaultPath).toBe(vaultDirectory);
  });
});

describe("PATCH /projects/:projectId", () => {
  it("updates name in registry response and on-disk manifest", async () => {
    const vaultDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Original Name", vaultPath: vaultDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const patchResponse = await testContext.app.request(`/projects/${projectUUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Project" }),
    });

    expect(patchResponse.status).toBe(200);
    const body = (await patchResponse.json()) as { name: string; vaultPath: string };
    expect(body.name).toBe("Renamed Project");
    expect(body.vaultPath).toBe(vaultDirectory);

    const manifest = JSON.parse(
      readFileSync(join(vaultDirectory, ".maskor", "project.json"), "utf-8"),
    ) as { name: string };
    expect(manifest.name).toBe("Renamed Project");
  });

  it("returns 404 for an unknown project UUID", async () => {
    const response = await testContext.app.request(
      "/projects/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ghost" }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("does not rename or move the on-disk vault folder", async () => {
    const vaultDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Before Rename", vaultPath: vaultDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    await testContext.app.request(`/projects/${projectUUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "After Rename" }),
    });

    expect(existsSync(vaultDirectory)).toBe(true);

    const getResponse = await testContext.app.request(`/projects/${projectUUID}`);
    const body = (await getResponse.json()) as { vaultPath: string };
    expect(body.vaultPath).toBe(vaultDirectory);
  });
});

describe("PATCH /projects/:projectId/vault-path", () => {
  it("re-points a project to a new path", async () => {
    const originalDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Move Me", vaultPath: originalDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const newDirectory = makeVaultDirectory();
    const patchResponse = await testContext.app.request(`/projects/${projectUUID}/vault-path`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPath: newDirectory }),
    });

    expect(patchResponse.status).toBe(200);
    const body = (await patchResponse.json()) as { projectUUID: string; vaultPath: string };
    expect(body.projectUUID).toBe(projectUUID);
    expect(body.vaultPath).toBe(newDirectory);

    const getResponse = await testContext.app.request(`/projects/${projectUUID}`);
    const getBody = (await getResponse.json()) as { vaultPath: string };
    expect(getBody.vaultPath).toBe(newDirectory);
  });

  it("returns 409 UUID_CONFLICT when new path has a different project's manifest", async () => {
    const originalDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Original", vaultPath: originalDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const otherUUID = "cccccccc-dddd-4444-aaaa-bbbbbbbbbbbb";
    const conflictDirectory = makeVaultDirectoryWithManifest(otherUUID);

    const response = await testContext.app.request(`/projects/${projectUUID}/vault-path`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPath: conflictDirectory }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("UUID_CONFLICT");
  });

  it("re-points with forceOverride:true when new path has a different project's manifest", async () => {
    const originalDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Force Me", vaultPath: originalDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const otherUUID = "eeeeeeee-ffff-4444-aaaa-aaaaaaaaaaaa";
    const conflictDirectory = makeVaultDirectoryWithManifest(otherUUID);

    const response = await testContext.app.request(`/projects/${projectUUID}/vault-path`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPath: conflictDirectory, forceOverride: true }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { projectUUID: string; vaultPath: string };
    expect(body.projectUUID).toBe(projectUUID);
    expect(body.vaultPath).toBe(conflictDirectory);

    const manifest = JSON.parse(
      readFileSync(join(conflictDirectory, ".maskor", "project.json"), "utf-8"),
    ) as { projectUUID: string };
    expect(manifest.projectUUID).toBe(projectUUID);
  });

  it("returns 409 CONFLICT when new path is already used by another project", async () => {
    const vaultA = makeVaultDirectory();
    const vaultB = makeVaultDirectory();

    const createA = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Project A", vaultPath: vaultA, mode: "adopt" }),
    });
    const { projectUUID: uuidA } = (await createA.json()) as { projectUUID: string };

    await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Project B", vaultPath: vaultB, mode: "adopt" }),
    });

    const response = await testContext.app.request(`/projects/${uuidA}/vault-path`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPath: vaultB }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("CONFLICT");
  });

  it("returns 404 for an unknown project UUID", async () => {
    const newDirectory = makeVaultDirectory();
    const response = await testContext.app.request(
      "/projects/00000000-0000-0000-0000-000000000000/vault-path",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPath: newDirectory }),
      },
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /projects/:projectId", () => {
  it("removes a registered project and returns 204", async () => {
    const vaultDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Temp Project", vaultPath: vaultDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const deleteResponse = await testContext.app.request(`/projects/${projectUUID}`, {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(204);

    const getResponse = await testContext.app.request(`/projects/${projectUUID}`);
    expect(getResponse.status).toBe(404);
  });
});
