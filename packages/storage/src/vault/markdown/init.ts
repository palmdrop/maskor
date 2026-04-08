import type { Fragment, Piece } from "@maskor/shared";
import { slugify } from "@maskor/shared";
import type { VaultConfig } from "../types";
import { VaultError } from "../types";
import { serializeFile } from "./serialize";
import { join } from "node:path";

const deriveTitle = (piece: Piece, uuid: string): string => {
  if (piece.title && piece.title.trim() !== "") {
    return piece.title.trim();
  }
  const firstLine = piece.content.split("\n").find((line: string) => line.trim() !== "");
  return firstLine?.trim() ?? `fragment-${uuid}`;
};

export const initFragment = async (config: VaultConfig, piece: Piece): Promise<Fragment> => {
  const uuid = crypto.randomUUID();
  const title = deriveTitle(piece, uuid);
  const slug = slugify(title);
  const filePath = join(config.root, "fragments", `${slug}.md`);

  if (await Bun.file(filePath).exists()) {
    throw new VaultError(
      "FILE_ALREADY_EXISTS",
      `Cannot initialize fragment: file already exists at "${filePath}"`,
      { filePath, reason: "A fragment with this title already exists in fragments/" },
    );
  }

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
