import { useNavigate } from "@tanstack/react-router";
import { useCommand } from "../useCommand";
import { ListSequences } from "@api/generated/sequences/sequences";
import type { Sequence } from "@api/generated/maskorAPI.schemas";

type CreateHandlers = {
  onCreateFragment: () => void;
  onCreateNote: () => void;
  onCreateReference: () => void;
  onCreateAspect: () => void;
};

export const useProjectShellCommands = (projectId: string, createHandlers: CreateHandlers) => {
  const navigate = useNavigate();

  // Navigation — project-scoped routes
  useCommand({
    id: "navigation:go-to-fragment-list",
    label: "Go to Fragment list",
    scope: "global",
    category: "navigation",
    run: () => void navigate({ to: "/projects/$projectId/fragments", params: { projectId } }),
  });

  useCommand({
    id: "navigation:go-to-overview",
    label: "Go to Overview",
    scope: "global",
    category: "navigation",
    run: () =>
      void navigate({
        to: "/projects/$projectId/overview",
        params: { projectId },
        search: { density: "full" },
      }),
  });

  useCommand({
    id: "navigation:go-to-preview",
    label: "Go to Preview",
    scope: "global",
    category: "navigation",
    run: () => void navigate({ to: "/projects/$projectId/preview", params: { projectId } }),
  });

  useCommand({
    id: "navigation:go-to-drafts",
    label: "Go to Drafts",
    scope: "global",
    category: "navigation",
    run: () => void navigate({ to: "/projects/$projectId/drafts", params: { projectId } }),
  });

  useCommand({
    id: "navigation:go-to-stats",
    label: "Go to Stats",
    scope: "global",
    category: "navigation",
    run: () => void navigate({ to: "/projects/$projectId/stats", params: { projectId } }),
  });

  useCommand({
    id: "navigation:go-to-history",
    label: "Go to History",
    scope: "global",
    category: "navigation",
    run: () => void navigate({ to: "/projects/$projectId/history", params: { projectId } }),
  });

  useCommand({
    id: "navigation:go-to-config",
    label: "Go to Project config",
    scope: "global",
    category: "navigation",
    run: () =>
      void navigate({
        to: "/projects/$projectId/config",
        params: { projectId },
        search: { tab: "general" },
      }),
  });

  // Create — open creation modal directly without leaving the current surface
  useCommand({
    id: "create:fragment",
    label: "Create fragment…",
    scope: "global",
    category: "create",
    run: createHandlers.onCreateFragment,
  });

  useCommand({
    id: "create:note",
    label: "Create note…",
    scope: "global",
    category: "create",
    run: createHandlers.onCreateNote,
  });

  useCommand({
    id: "create:reference",
    label: "Create reference…",
    scope: "global",
    category: "create",
    run: createHandlers.onCreateReference,
  });

  useCommand({
    id: "create:aspect",
    label: "Create aspect…",
    scope: "global",
    category: "create",
    run: createHandlers.onCreateAspect,
  });

  // Project — parameterized sequence switch
  useCommand({
    id: "project:switch-sequence",
    label: "Switch sequence",
    scope: "global",
    category: "project",
    arg: {
      items: async () => {
        const response = await ListSequences(projectId);
        return response.status === 200 ? response.data.sequences : [];
      },
      getKey: (item) => (item as Sequence).uuid,
      getLabel: (item) => (item as Sequence).name,
      placeholder: "Switch to sequence…",
    },
    run: (arg) => {
      const sequence = arg as Sequence;
      void navigate({
        to: "/projects/$projectId/overview",
        params: { projectId },
        search: { sequence: sequence.uuid, density: "full" },
      });
    },
  });
};
