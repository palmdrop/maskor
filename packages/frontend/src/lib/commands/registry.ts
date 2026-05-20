import type { CommandDef } from "./types";
import { router } from "@/router";
import { ListProjects } from "@api/generated/projects/projects";
import type { Project } from "@api/generated/maskorAPI.schemas";

export const staticRegistry: CommandDef[] = [
  {
    id: "navigation:go-to-project-management",
    label: "Go to Project management",
    scope: "global",
    category: "navigation",
    run: () => void router.navigate({ to: "/" }),
  },
  {
    id: "project:switch-project",
    label: "Switch project",
    scope: "global",
    category: "project",
    arg: {
      items: async () => {
        const response = await ListProjects();
        return response.status === 200 ? response.data : [];
      },
      getKey: (item) => (item as Project).projectUUID,
      getLabel: (item) => (item as Project).name,
      placeholder: "Switch to project…",
    },
    run: (arg) => {
      const project = arg as Project;
      void router.navigate({
        to: "/projects/$projectId",
        params: { projectId: project.projectUUID },
      });
    },
  },
];
