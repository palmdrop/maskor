import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { createTestApp } from "../helpers/create-test-app";
import { BASIC_VAULT } from "@maskor/test-fixtures";

let testContext: ReturnType<typeof createTestApp>;
let vaultCounter = 0;

const makeVaultDirectory = (): string => {
  vaultCounter += 1;
  const directory = join(testContext.temporaryDirectory, `vault-${vaultCounter}`);
  cpSync(BASIC_VAULT, directory, { recursive: true });
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
      body: JSON.stringify({ name: "My Project", vaultPath: vaultDirectory }),
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

  it("returns 400 when name is missing", async () => {
    const vaultDirectory = makeVaultDirectory();
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaultPath: vaultDirectory }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 when vaultPath is missing", async () => {
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Missing vault" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 when vaultPath is not absolute", async () => {
    const response = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Relative Path Project", vaultPath: "relative/path/to/vault" }),
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
      body: JSON.stringify({ name: "Lookup Project", vaultPath: vaultDirectory }),
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

describe("DELETE /projects/:projectId", () => {
  it("removes a registered project and returns 204", async () => {
    const vaultDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Temp Project", vaultPath: vaultDirectory }),
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
