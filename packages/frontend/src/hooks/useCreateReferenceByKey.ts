import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateReference,
  getListReferencesQueryKey,
} from "@api/generated/references/references";

// Creates a reference by key (empty body) and refreshes the cached reference list. Mirrors
// `useCreateAspectByKey` so the metadata form's create-and-attach combobox can mint a reference
// inline — without navigating to project config. The body is intentionally empty; the user fills
// in the citation/URL later in the reference editor. Rejects on a non-201 response, carrying the
// server message when present — callers surface that (inline error, or a command's `onFailure`).
export const useCreateReferenceByKey = (projectId: string) => {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useCreateReference();

  const createReference = useCallback(
    async (referenceKey: string) => {
      const result = await mutateAsync({ projectId, data: { key: referenceKey, content: "" } });

      if (result.status !== 201) {
        const message = (result.data as { message?: string }).message;
        throw new Error(message ?? "Failed to create reference.");
      }

      await queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
    },
    [mutateAsync, projectId, queryClient],
  );

  return { createReference, isCreating: isPending };
};
