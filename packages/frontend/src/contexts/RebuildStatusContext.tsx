import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetProjectRebuildStatus } from "@api/generated/projects/projects";

type RebuildStatusContextValue = {
  isRebuilding: boolean;
};

const RebuildStatusContext = createContext<RebuildStatusContextValue>({ isRebuilding: false });

export const useRebuildStatus = () => useContext(RebuildStatusContext);

type Props = {
  projectId: string;
  children: ReactNode;
};

export const RebuildStatusProvider = ({ projectId, children }: Props) => {
  const queryClient = useQueryClient();
  const wasRebuilding = useRef(false);

  const { data } = useGetProjectRebuildStatus(projectId, {
    query: {
      // Poll every 500ms while a rebuild is in progress; stop when done.
      refetchInterval: (query) => {
        const rebuilding = query.state.data?.status === 200 && query.state.data.data.rebuilding;
        return rebuilding ? 500 : false;
      },
    },
  });

  const isRebuilding = data?.status === 200 ? data.data.rebuilding : false;

  useEffect(() => {
    if (wasRebuilding.current && !isRebuilding) {
      // Rebuild just completed — refresh all project queries so views reflect rebuilt data.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith(`/projects/${projectId}/`);
        },
      });
    }
    wasRebuilding.current = isRebuilding;
  }, [isRebuilding, projectId, queryClient]);

  return (
    <RebuildStatusContext.Provider value={{ isRebuilding }}>
      {children}
    </RebuildStatusContext.Provider>
  );
};
