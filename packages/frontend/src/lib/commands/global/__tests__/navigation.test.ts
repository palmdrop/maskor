import { describe, it, expect, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const matchesRef: { value: Array<{ params: Record<string, unknown> }> } = { value: [] };

vi.mock("@/router", () => ({
  router: {
    navigate: mockNavigate,
    get state() {
      return { matches: matchesRef.value };
    },
  },
}));

const { navigationCommands } = await import("../navigation");

const byId = (id: string) => navigationCommands.find((c) => c.id === id)!;

describe("global/navigation", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    matchesRef.value = [];
  });

  it("registers go-to-project-management as always-available", () => {
    const command = byId("navigation:go-to-project-management");
    expect(command.disabled?.()).toBeUndefined();
    void command.run();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it.each([
    ["navigation:go-to-overview", "/projects/$projectId/overview"],
    ["navigation:go-to-fragment-list", "/projects/$projectId/fragments"],
    ["navigation:go-to-preview", "/projects/$projectId/preview"],
    ["navigation:go-to-drafts", "/projects/$projectId/drafts"],
    ["navigation:go-to-stats", "/projects/$projectId/stats"],
    ["navigation:go-to-history", "/projects/$projectId/history"],
    ["navigation:go-to-config", "/projects/$projectId/config"],
  ])("self-disables %s when no project is active", (id) => {
    const command = byId(id);
    expect(command.disabled?.()).toBe("No active project");
  });

  it("navigates to overview with active project and detail=prose", () => {
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    const command = byId("navigation:go-to-overview");
    expect(command.disabled?.()).toBeUndefined();
    void command.run();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/overview",
      params: { projectId: "p-1" },
      search: { detail: "prose" },
    });
  });

  it("navigates to config with tab=general", () => {
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId("navigation:go-to-config").run();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/config",
      params: { projectId: "p-1" },
      search: { tab: "general" },
    });
  });

  it.each([
    ["navigation:go-to-fragment-list", "/projects/$projectId/fragments"],
    ["navigation:go-to-preview", "/projects/$projectId/preview"],
    ["navigation:go-to-drafts", "/projects/$projectId/drafts"],
    ["navigation:go-to-stats", "/projects/$projectId/stats"],
    ["navigation:go-to-history", "/projects/$projectId/history"],
  ])("navigates %s to %s with active project", (id, to) => {
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId(id).run();
    expect(mockNavigate).toHaveBeenCalledWith({ to, params: { projectId: "p-1" } });
  });
});
