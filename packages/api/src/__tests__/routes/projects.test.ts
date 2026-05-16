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
    JSON.stringify({ projectUUID, name: "Manifest Project", registeredAt: new Date().toISOString() }),
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
      body: JSON.stringify({ name: "Relative Path Project", vaultPath: "relative/path/to/vault", mode: "adopt" }),
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
