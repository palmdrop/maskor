import trash from "trash";
import { rm } from "node:fs/promises";

export async function moveToTrashOrDelete(
  absolutePath: string,
): Promise<{ method: "trash" | "hard-delete" }> {
  try {
    await trash(absolutePath);
    return { method: "trash" };
  } catch {
    await rm(absolutePath, { recursive: true, force: true });
    return { method: "hard-delete" };
  }
}
