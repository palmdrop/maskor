import { router } from "@/router";
import { ListProjects } from "@api/generated/projects/projects";
import { ListSequences } from "@api/generated/sequences/sequences";
import type { Project, Sequence } from "@api/generated/maskorAPI.schemas";
import { defineGlobalCommand } from "../define";
import { getActiveProjectId } from "../router-helpers";

const switchProject = defineGlobalCommand({
  id: "project:switch-project",
  label: "Switch project",
  category: "project",
  arg: {
    items: async (): Promise<Project[]> => {
      const response = await ListProjects();
      return response.status === 200 ? response.data : [];
    },
    getKey: (project) => project.projectUUID,
    getLabel: (project) => project.name,
    placeholder: "Switch to project…",
  },
  run: (project) => {
    void router.navigate({
      to: "/projects/$projectId",
      params: { projectId: project.projectUUID },
    });
  },
});

const switchSequence = defineGlobalCommand({
  id: "project:switch-sequence",
  label: "Switch sequence",
  category: "project",
  disabled: () => (getActiveProjectId() ? undefined : "No active project"),
  arg: {
    items: async (): Promise<Sequence[]> => {
      const projectId = getActiveProjectId();
      if (!projectId) return [];
      const response = await ListSequences(projectId);
      return response.status === 200 ? response.data.sequences : [];
    },
    getKey: (sequence) => sequence.uuid,
    getLabel: (sequence) => sequence.name,
    placeholder: "Switch to sequence…",
  },
  run: (sequence) => {
    const projectId = getActiveProjectId();
    if (!projectId) return;
    void router.navigate({
      to: "/projects/$projectId/overview",
      params: { projectId },
      search: { sequence: sequence.uuid, density: "full" },
    });
  },
});

export const projectCommands = [switchProject, switchSequence] as const;
