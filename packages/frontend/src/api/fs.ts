export type { FsEntry, FsListResponse as FsListData } from "./generated/maskorAPI.schemas";
export { getListDirectoryQueryKey, getGetHomeDirectoryQueryKey } from "./generated/filesystem/filesystem";

import {
  useGetHomeDirectory,
  useListDirectory,
  ListDirectory,
} from "./generated/filesystem/filesystem";
import type { ApiRequestError } from "./errors";

export const useFsHome = () => useGetHomeDirectory();

export const useFsList = (path: string | null) =>
  useListDirectory<Awaited<ReturnType<typeof ListDirectory>>, ApiRequestError>(
    { path: path ?? "" },
    { query: { enabled: path !== null, retry: false } },
  );
