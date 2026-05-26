import { router } from "@/router";
import { ListProjects } from "@api/generated/projects/projects";
import type { Project } from "@api/generated/maskorAPI.schemas";
import { defineGlobalCommand } from "../define";

const switchProject = defineGlobalCommand({
  id: "project:switch-project",
  label: "Switch project",
  category: "project",
  arg: {
    items: async (): Promise<readonly Project[]> => {
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

export const projectCommands = [switchProject] as const;
