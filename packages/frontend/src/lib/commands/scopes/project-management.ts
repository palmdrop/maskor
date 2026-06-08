import { defineScope, defineScopeCommand } from "../define";

export interface ProjectManagementContext {
  canSaveSettings: boolean;
  saveSettings: () => void;
}

export const projectManagementScope = defineScope<ProjectManagementContext>("project-management", {
  label: "Project management",
});

const saveSettings = defineScopeCommand(projectManagementScope, {
  id: "project-management:save-settings",
  onFailure: "Failed to save settings.",
  label: "Save settings",
  category: "project",
  disabled: (ctx) => (ctx.canSaveSettings ? undefined : "No changes to save"),
  run: (ctx) => ctx.saveSettings(),
});

export const projectManagementCommands = [saveSettings] as const;
