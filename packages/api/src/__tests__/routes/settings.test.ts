import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestApp } from "../helpers/create-test-app";

let testContext: ReturnType<typeof createTestApp>;

beforeAll(() => {
  testContext = createTestApp();
});

afterAll(() => {
  testContext.cleanup();
});

describe("GET /settings", () => {
  it("returns default maskorManagedRoot when no settings file exists", async () => {
    const response = await testContext.app.request("/settings");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { maskorManagedRoot: string; warning?: string };
    expect(typeof body.maskorManagedRoot).toBe("string");
    expect(body.maskorManagedRoot.length).toBeGreaterThan(0);
    expect(body.warning).toBeUndefined();
  });

  it("returns warning when settings file is unparsable", async () => {
    const settingsPath = join(testContext.temporaryDirectory, "config", "settings.json");
    writeFileSync(settingsPath, "{ not valid json", "utf-8");

    const response = await testContext.app.request("/settings");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { maskorManagedRoot: string; warning?: string };
    expect(typeof body.warning).toBe("string");
    expect(body.warning).toContain("could not be parsed");

    // Restore for subsequent tests
    writeFileSync(settingsPath, "{}", "utf-8");
  });
});

describe("PATCH /settings", () => {
  it("writes maskorManagedRoot to the settings file and returns updated settings", async () => {
    const newRoot = "/tmp/my-maskor-root";
    const response = await testContext.app.request("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maskorManagedRoot: newRoot }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { maskorManagedRoot: string };
    expect(body.maskorManagedRoot).toBe(newRoot);

    // Verify the GET endpoint reflects the new value
    const getResponse = await testContext.app.request("/settings");
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as { maskorManagedRoot: string };
    expect(getBody.maskorManagedRoot).toBe(newRoot);
  });

  it("changing maskorManagedRoot does not affect existing registered projects", async () => {
    // Register a project first
    const vaultDirectory = join(testContext.temporaryDirectory, "vault-settings-test");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(vaultDirectory, { recursive: true });

    const createResponse = await testContext.app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Settings Test Project",
        vaultPath: vaultDirectory,
        mode: "adopt",
      }),
    });
    expect(createResponse.status).toBe(201);
    const { projectUUID } = (await createResponse.json()) as { projectUUID: string };

    // Patch settings
    await testContext.app.request("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maskorManagedRoot: "/some/other/root" }),
    });

    // Project should still exist with its original vaultPath
    const getProjectResponse = await testContext.app.request(`/projects/${projectUUID}`);
    expect(getProjectResponse.status).toBe(200);
    const project = (await getProjectResponse.json()) as { vaultPath: string };
    expect(project.vaultPath).toBe(vaultDirectory);
  });
});
