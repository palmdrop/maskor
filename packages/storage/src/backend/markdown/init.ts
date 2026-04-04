import type { Fragment, FragmentUUID, Piece } from "@maskor/shared";
import { slugify } from "@maskor/shared";
import type { VaultConfig } from "../types";
import { VaultError } from "../types";
import { serializeFile } from "./serialize";
import { join } from "node:path";
import { existsSync } from "node:fs";

const deriveTitle = (piece: Piece): string => {
  if (piece.title && piece.title.trim() !== "") return piece.title.trim();
  const firstLine = piece.content.split("\n").find((l: string) => l.trim() !== "");
  return firstLine?.trim() ?? "Untitled";
};

export const initFragment = async (config: VaultConfig, piece: Piece): Promise<Fragment> => {
  const title = deriveTitle(piece);
  const slug = slugify(title);
  const filePath = join(config.root, "fragments", `${slug}.md`);

  if (existsSync(filePath)) {
    throw new VaultError(
      "FILE_ALREADY_EXISTS",
      `Cannot initialize fragment: file already exists at "${filePath}"`,
      { filePath, reason: "A fragment with this title already exists in fragments/" },
    );
  }

  const uuid = crypto.randomUUID() as FragmentUUID;

  const fragment: Fragment = {
    uuid,
    title,
    version: 1,
    pool: "unprocessed",
    readyStatus: 0,
    properties: {},
    notes: [],
    references: [],
    content: piece.content,
    contentHash: "",
    updatedAt: new Date(0),
  };

  const serialized = serializeFile({
    frontmatter: {
      uuid,
      title,
      version: 1,
      pool: "unprocessed",
      readyStatus: 0,
      notes: [],
      references: [],
    },
    body: piece.content,
  });

  await Bun.write(filePath, serialized);

  return fragment;
};
