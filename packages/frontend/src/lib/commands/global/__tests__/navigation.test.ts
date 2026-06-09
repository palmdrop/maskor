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
    localStorage.clear();
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
    ["navigation:go-to-drafts", "/projects/$projectId/drafts"],
    ["navigation:go-to-stats", "/projects/$projectId/stats"],
    ["navigation:go-to-history", "/projects/$projectId/history"],
  ])("navigates %s to %s with active project", (id, to) => {
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId(id).run();
    expect(mockNavigate).toHaveBeenCalledWith({ to, params: { projectId: "p-1" } });
  });

  // --- overview ---

  it("navigates to overview with empty search when no sequence stored (persisted detail level resolves)", () => {
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId("navigation:go-to-overview").run();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/overview",
      params: { projectId: "p-1" },
      search: {},
    });
  });

  it("navigates to overview with stored sequence in search", () => {
    localStorage.setItem("maskor:nav:p-1:overview:sequence", "seq-abc");
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId("navigation:go-to-overview").run();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/overview",
      params: { projectId: "p-1" },
      search: { sequence: "seq-abc" },
    });
  });

  // --- fragment list ---

  it("navigates to fragment list root when no fragment stored", () => {
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId("navigation:go-to-fragment-list").run();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/fragments",
      params: { projectId: "p-1" },
    });
  });

  it("navigates directly to stored fragment when one is stored", () => {
    localStorage.setItem("maskor:nav:p-1:fragments:fragmentId", "frag-xyz");
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId("navigation:go-to-fragment-list").run();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/fragments/$fragmentId",
      params: { projectId: "p-1", fragmentId: "frag-xyz" },
    });
  });

  // --- preview ---

  it("navigates to preview with empty search when no sequence stored", () => {
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId("navigation:go-to-preview").run();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/preview",
      params: { projectId: "p-1" },
      search: {},
    });
  });

  it("navigates to preview with stored sequence in search", () => {
    localStorage.setItem("maskor:nav:p-1:preview:sequence", "seq-preview-1");
    matchesRef.value = [{ params: { projectId: "p-1" } }];
    void byId("navigation:go-to-preview").run();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/preview",
      params: { projectId: "p-1" },
      search: { sequence: "seq-preview-1" },
    });
  });
});
