import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project, Sequence } from "@api/generated/maskorAPI.schemas";

const mockNavigate = vi.fn();
const mockListProjects = vi.fn();
const mockListSequences = vi.fn();
const matchesRef: { value: Array<{ params: Record<string, unknown> }> } = { value: [] };

vi.mock("@/router", () => ({
  router: {
    navigate: mockNavigate,
    get state() {
      return { matches: matchesRef.value };
    },
  },
}));

vi.mock("@api/generated/projects/projects", () => ({ ListProjects: mockListProjects }));
vi.mock("@api/generated/sequences/sequences", () => ({ ListSequences: mockListSequences }));

const { projectCommands } = await import("../project");

// Narrow by id literal so `.run(arg)` accepts the specific A type for the
// looked-up command rather than the intersection of all commands' Args.
type ProjectCommand = (typeof projectCommands)[number];
const byId = <Id extends ProjectCommand["id"]>(
  id: Id,
): Extract<ProjectCommand, { id: Id }> =>
  projectCommands.find((c) => c.id === id) as Extract<ProjectCommand, { id: Id }>;

describe("global/project", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockListProjects.mockReset();
    mockListSequences.mockReset();
    matchesRef.value = [];
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

  describe("project:switch-sequence", () => {
    it("self-disables when no project is active", () => {
      expect(byId("project:switch-sequence").disabled?.()).toBe("No active project");
    });

    it("becomes enabled when a project is active", () => {
      matchesRef.value = [{ params: { projectId: "p-1" } }];
      expect(byId("project:switch-sequence").disabled?.()).toBeUndefined();
    });

    it("loads sequences for the active project", async () => {
      matchesRef.value = [{ params: { projectId: "p-1" } }];
      const sequences: Sequence[] = [{ uuid: "s-1", name: "Main" } as Sequence];
      mockListSequences.mockResolvedValue({ status: 200, data: { sequences } });

      const itemsFn = byId("project:switch-sequence").arg!.items as () => Promise<Sequence[]>;
      const items = await itemsFn();

      expect(mockListSequences).toHaveBeenCalledWith("p-1");
      expect(items).toEqual(sequences);
    });

    it("returns empty list when no project is active even if called", async () => {
      const itemsFn = byId("project:switch-sequence").arg!.items as () => Promise<Sequence[]>;
      expect(await itemsFn()).toEqual([]);
      expect(mockListSequences).not.toHaveBeenCalled();
    });

    it("navigates to overview with the picked sequence", () => {
      matchesRef.value = [{ params: { projectId: "p-1" } }];
      const sequence = { uuid: "s-1", name: "Main" } as Sequence;
      void byId("project:switch-sequence").run(sequence);
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/projects/$projectId/overview",
        params: { projectId: "p-1" },
        search: { sequence: "s-1", density: "full" },
      });
    });
  });
});
