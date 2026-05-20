import { describe, it, expect, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const mockListProjects = vi.fn();

vi.mock("@/router", () => ({
  router: { navigate: mockNavigate },
}));

vi.mock("@api/generated/projects/projects", () => ({
  ListProjects: mockListProjects,
}));

// Import after mocks are set up
const { staticRegistry } = await import("../registry");

describe("staticRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("contains navigation:go-to-project-management with correct shape", () => {
    const cmd = staticRegistry.find((c) => c.id === "navigation:go-to-project-management");
    expect(cmd).toBeDefined();
    expect(cmd?.label).toBe("Go to Project management");
    expect(cmd?.scope).toBe("global");
    expect(cmd?.category).toBe("navigation");
    expect(cmd?.arg).toBeUndefined();
  });

  it("navigation:go-to-project-management runs navigate to /", () => {
    const cmd = staticRegistry.find((c) => c.id === "navigation:go-to-project-management")!;
    cmd.run();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("contains project:switch-project with correct shape", () => {
    const cmd = staticRegistry.find((c) => c.id === "project:switch-project");
    expect(cmd).toBeDefined();
    expect(cmd?.label).toBe("Switch project");
    expect(cmd?.scope).toBe("global");
    expect(cmd?.category).toBe("project");
    expect(cmd?.arg).toBeDefined();
  });

  it("project:switch-project arg.items calls ListProjects and returns projects", async () => {
    const projects = [{ projectUUID: "p-1", name: "Alpha" }];
    mockListProjects.mockResolvedValue({ status: 200, data: projects });

    const cmd = staticRegistry.find((c) => c.id === "project:switch-project")!;
    const items = await (cmd.arg!.items as () => Promise<unknown[]>)();

    expect(mockListProjects).toHaveBeenCalled();
    expect(items).toEqual(projects);
  });

  it("project:switch-project arg.items returns empty array on non-200 response", async () => {
    mockListProjects.mockResolvedValue({ status: 500 });

    const cmd = staticRegistry.find((c) => c.id === "project:switch-project")!;
    const items = await (cmd.arg!.items as () => Promise<unknown[]>)();

    expect(items).toEqual([]);
  });

  it("project:switch-project run navigates to the selected project", () => {
    const project = { projectUUID: "p-1", name: "Alpha" };
    const cmd = staticRegistry.find((c) => c.id === "project:switch-project")!;
    cmd.run(project);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId",
      params: { projectId: "p-1" },
    });
  });

  it("project:switch-project arg uses getKey and getLabel on project", () => {
    const project = { projectUUID: "p-1", name: "Alpha" };
    const cmd = staticRegistry.find((c) => c.id === "project:switch-project")!;
    expect(cmd.arg!.getKey(project)).toBe("p-1");
    expect(cmd.arg!.getLabel(project)).toBe("Alpha");
  });
});
