import { readFile, writeFile } from "node:fs/promises";
import { DraftManifestSchema, type DraftManifest } from "@maskor/shared";
import { manifestPath } from "./paths";

export const readManifest = async (draftDirectoryPath: string): Promise<DraftManifest> => {
  const raw = await readFile(manifestPath(draftDirectoryPath), "utf8");
  const parsed = JSON.parse(raw);
  return DraftManifestSchema.parse(parsed);
};

export const writeManifest = async (
  draftDirectoryPath: string,
  manifest: DraftManifest,
): Promise<void> => {
  const validated = DraftManifestSchema.parse(manifest);
  await writeFile(
    manifestPath(draftDirectoryPath),
    JSON.stringify(validated, null, 2) + "\n",
    "utf8",
  );
};
