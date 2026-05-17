import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./fetch";

type SettingsData = { maskorManagedRoot: string; warning?: string };
type SettingsEnvelope = { data: SettingsData; status: 200; headers: Headers };

const getSettings = (): Promise<SettingsEnvelope> =>
  customFetch<SettingsEnvelope>("/settings", { method: "GET" });

export const SETTINGS_QUERY_KEY = ["settings"];

export const useSettings = () =>
  useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: getSettings, staleTime: 60_000 });

export const usePatchSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SettingsData>) =>
      customFetch<SettingsEnvelope>("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });
};
