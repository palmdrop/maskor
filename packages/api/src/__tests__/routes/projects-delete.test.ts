import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const trashMock = mock(async (_input: string | readonly string[]) => {});

mock.module("trash", () => ({
  default: trashMock,
}));

const { createTestApp } = await import("../helpers/create-test-app");

let testContext: ReturnType<typeof createTestApp>;
let vaultCounter = 0;

const makeVaultDirectory = (): string => {
  vaultCounter += 1;
  const directory = join(testContext.temporaryDirectory, `vault-del-${vaultCounter}`);
  mkdirSync(directory, { recursive: true });
  return directory;
};

beforeAll(() => {
  testContext = createTestApp();
});

afterAll(() => {
  testContext.cleanup();
});

describe("DELETE /projects/:projectId", () => {
  it("deregister-only: removes registry row and leaves vault files untouched", async () => {
    trashMock.mockReset();
    const vaultDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Deregister Only", vaultPath: vaultDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const deleteResponse = await testContext.app.request(`/projects/${projectUUID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteFiles: false }),
    });

    expect(deleteResponse.status).toBe(204);
    expect(existsSync(vaultDirectory)).toBe(true);
    expect(trashMock).not.toHaveBeenCalled();

    const getResponse = await testContext.app.request(`/projects/${projectUUID}`);
    expect(getResponse.status).toBe(404);
  });

  it("deregister-with-delete-trash: removes registry row and moves vault to trash when trash succeeds", async () => {
    trashMock.mockReset();
    trashMock.mockImplementation(async () => {});

    const vaultDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Trash This", vaultPath: vaultDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const deleteResponse = await testContext.app.request(`/projects/${projectUUID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteFiles: true }),
    });

    expect(deleteResponse.status).toBe(200);
    const body = (await deleteResponse.json()) as { method: string };
    expect(body.method).toBe("trash");
    expect(trashMock).toHaveBeenCalledWith(vaultDirectory);

    const getResponse = await testContext.app.request(`/projects/${projectUUID}`);
    expect(getResponse.status).toBe(404);
  });

  it("deregister-with-delete-hard-fallback: hard-deletes vault when trash throws", async () => {
    trashMock.mockReset();
    trashMock.mockImplementation(async () => {
      throw new Error("trash unavailable");
    });

    const vaultDirectory = makeVaultDirectory();
    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hard Delete This", vaultPath: vaultDirectory, mode: "adopt" }),
    });
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    const deleteResponse = await testContext.app.request(`/projects/${projectUUID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteFiles: true }),
    });

    expect(deleteResponse.status).toBe(200);
    const body = (await deleteResponse.json()) as { method: string };
    expect(body.method).toBe("hard-delete");
    expect(existsSync(vaultDirectory)).toBe(false);

    const getResponse = await testContext.app.request(`/projects/${projectUUID}`);
    expect(getResponse.status).toBe(404);
  });
});
