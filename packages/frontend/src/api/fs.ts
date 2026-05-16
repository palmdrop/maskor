import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./fetch";

export type FsEntry = {
  name: string;
  kind: "file" | "directory";
  hidden: boolean;
  hasMaskorManifest: boolean;
  hasObsidianDir: boolean;
};

export type FsListData = {
  path: string;
  parent: string | null;
  entries: FsEntry[];
};

type FsListEnvelope = { data: FsListData; status: 200; headers: Headers };
type FsHomeEnvelope = { data: { homedir: string }; status: 200; headers: Headers };

const getFsHome = (): Promise<FsHomeEnvelope> =>
  customFetch<FsHomeEnvelope>("/fs/home", { method: "GET" });

const getFsList = (path: string): Promise<FsListEnvelope> =>
  customFetch<FsListEnvelope>(`/fs/list?path=${encodeURIComponent(path)}`, { method: "GET" });

export const useFsHome = () =>
  useQuery({ queryKey: ["fs", "home"], queryFn: getFsHome, staleTime: Infinity });

export const useFsList = (path: string | null) =>
  useQuery({
    queryKey: ["fs", "list", path],
    queryFn: () => getFsList(path!),
    enabled: path !== null,
    retry: false,
  });
