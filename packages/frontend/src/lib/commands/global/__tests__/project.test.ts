import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project } from "@api/generated/maskorAPI.schemas";

const mockNavigate = vi.fn();
const mockListProjects = vi.fn();

vi.mock("@/router", () => ({
  router: {
    navigate: mockNavigate,
  },
}));

vi.mock("@api/generated/projects/projects", () => ({ ListProjects: mockListProjects }));

const { projectCommands } = await import("../project");

// Narrow by id literal so `.run(arg)` accepts the specific A type for the
// looked-up command rather than the intersection of all commands' Args.
type ProjectCommand = (typeof projectCommands)[number];
const byId = <Id extends ProjectCommand["id"]>(id: Id): Extract<ProjectCommand, { id: Id }> =>
  projectCommands.find((c) => c.id === id) as Extract<ProjectCommand, { id: Id }>;

describe("global/project", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockListProjects.mockReset();
  });

  describe("project:switch-project", () => {
    it("is always available", () => {
      expect(byId("project:switch-project").disabled?.()).toBeUndefined();
    });

    it("loads projects via ListProjects (200)", async () => {
      const projects: Project[] = [{ projectUUID: "p-1", name: "Alpha" } as Project];
      mockListProjects.mockResolvedValue({ status: 200, data: projects });

      const argSource = byId("project:switch-project").arg;
      const itemsFn = argSource?.items as () => Promise<Project[]>;
      const items = await itemsFn();

      expect(mockListProjects).toHaveBeenCalled();
      expect(items).toEqual(projects);
    });

    it("returns empty list on non-200", async () => {
      mockListProjects.mockResolvedValue({ status: 500 });
      const itemsFn = byId("project:switch-project").arg!.items as () => Promise<Project[]>;
      expect(await itemsFn()).toEqual([]);
    });

    it("navigates to the picked project", () => {
      const project = { projectUUID: "p-1", name: "Alpha" } as Project;
      void byId("project:switch-project").run(project);
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/projects/$projectId",
        params: { projectId: "p-1" },
      });
    });
  });
});
