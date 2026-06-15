import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateAspect, getListAspectsQueryKey } from "@api/generated/aspects/aspects";

// Creates an aspect by key and refreshes the cached aspect list. Shared by the metadata form's
// create-and-attach combobox and the aspect reader's orphan "Create aspect" affordance so the
// mutation + invalidation live in one place. Rejects on a non-201 response, carrying the server
// message when present — callers surface that (inline error, or a command's `onFailure` toast).
export const useCreateAspectByKey = (projectId: string) => {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useCreateAspect();

  const createAspect = useCallback(
    async (aspectKey: string) => {
      const result = await mutateAsync({ projectId, data: { key: aspectKey } });

      if (result.status !== 201) {
        const message = (result.data as { message?: string }).message;
        throw new Error(message ?? "Failed to create aspect.");
      }

      await queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
    },
    [mutateAsync, projectId, queryClient],
  );

  return { createAspect, isCreating: isPending };
};
