import { router } from "@/router";

// Reads the active project id from the router's current matches. Returns
// undefined when no `/projects/$projectId/*` route is active. Used by global
// commands that target project-scoped routes — they self-disable when no
// project is active.
export const getActiveProjectId = (): string | undefined => {
  for (const match of router.state.matches) {
    const params = match.params as { projectId?: string } | undefined;
    if (params?.projectId) return params.projectId;
  }
  return undefined;
};
