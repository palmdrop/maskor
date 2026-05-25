import { useCommand } from "../useCommand";

type CreateHandlers = {
  onCreateFragment: () => void;
  onCreateNote: () => void;
  onCreateReference: () => void;
  onCreateAspect: () => void;
};

// Only the `create:*` commands remain in this catalog hook. Navigation and
// project switching live in commands/global/* (Phase 2). The `create:*` set
// is intertwined with ProjectShellLayout's dialog state, so it migrates with
// the rest of the scopes in Phase 4.
export const useProjectShellCommands = (createHandlers: CreateHandlers) => {
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
};
