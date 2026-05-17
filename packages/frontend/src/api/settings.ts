import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./fetch";

type SettingsData = { maskorManagedRoot: string };
type SettingsEnvelope = { data: SettingsData; status: 200; headers: Headers };

const getSettings = (): Promise<SettingsEnvelope> =>
  customFetch<SettingsEnvelope>("/settings", { method: "GET" });

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: getSettings, staleTime: 60_000 });
