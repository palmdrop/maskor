import { router } from "@/router";
import { defineGlobalCommand } from "../define";
import { getActiveProjectId } from "../router-helpers";

const NO_PROJECT = "No active project";

// Always-available — does not require a project to be open.
const goToProjectManagement = defineGlobalCommand({
  id: "navigation:go-to-project-management",
  label: "Go to Project management",
  category: "navigation",
  run: () => void router.navigate({ to: "/" }),
});

// Project-scoped navigation. Reads projectId from the router at run time and
// self-disables when no project is active.
const goToOverview = defineGlobalCommand({
  id: "navigation:go-to-overview",
  label: "Go to Overview",
  category: "navigation",
  disabled: () => (getActiveProjectId() ? undefined : NO_PROJECT),
  run: () => {
    const projectId = getActiveProjectId();
    if (!projectId) return;
    void router.navigate({
      to: "/projects/$projectId/overview",
      params: { projectId },
      search: { detail: "prose" },
    });
  },
});

const goToFragmentList = defineGlobalCommand({
  id: "navigation:go-to-fragment-list",
  label: "Go to Fragment list",
  category: "navigation",
  disabled: () => (getActiveProjectId() ? undefined : NO_PROJECT),
  run: () => {
    const projectId = getActiveProjectId();
    if (!projectId) return;
    void router.navigate({ to: "/projects/$projectId/fragments", params: { projectId } });
  },
});

const goToPreview = defineGlobalCommand({
  id: "navigation:go-to-preview",
  label: "Go to Preview",
  category: "navigation",
  disabled: () => (getActiveProjectId() ? undefined : NO_PROJECT),
  run: () => {
    const projectId = getActiveProjectId();
    if (!projectId) return;
    void router.navigate({ to: "/projects/$projectId/preview", params: { projectId } });
  },
});

const goToDrafts = defineGlobalCommand({
  id: "navigation:go-to-drafts",
  label: "Go to Drafts",
  category: "navigation",
  disabled: () => (getActiveProjectId() ? undefined : NO_PROJECT),
  run: () => {
    const projectId = getActiveProjectId();
    if (!projectId) return;
    void router.navigate({ to: "/projects/$projectId/drafts", params: { projectId } });
  },
});

const goToStats = defineGlobalCommand({
  id: "navigation:go-to-stats",
  label: "Go to Stats",
  category: "navigation",
  disabled: () => (getActiveProjectId() ? undefined : NO_PROJECT),
  run: () => {
    const projectId = getActiveProjectId();
    if (!projectId) return;
    void router.navigate({ to: "/projects/$projectId/stats", params: { projectId } });
  },
});

const goToHistory = defineGlobalCommand({
  id: "navigation:go-to-history",
  label: "Go to History",
  category: "navigation",
  disabled: () => (getActiveProjectId() ? undefined : NO_PROJECT),
  run: () => {
    const projectId = getActiveProjectId();
    if (!projectId) return;
    void router.navigate({ to: "/projects/$projectId/history", params: { projectId } });
  },
});

const goToConfig = defineGlobalCommand({
  id: "navigation:go-to-config",
  label: "Go to Project config",
  category: "navigation",
  disabled: () => (getActiveProjectId() ? undefined : NO_PROJECT),
  run: () => {
    const projectId = getActiveProjectId();
    if (!projectId) return;
    void router.navigate({
      to: "/projects/$projectId/config",
      params: { projectId },
      search: { tab: "general" },
    });
  },
});

export const navigationCommands = [
  goToProjectManagement,
  goToOverview,
  goToFragmentList,
  goToPreview,
  goToDrafts,
  goToStats,
  goToHistory,
  goToConfig,
] as const;
