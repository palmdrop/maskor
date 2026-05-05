import type { Fragment, Piece } from "@maskor/shared";
import type { VaultConfig } from "../types";
import { VaultError } from "../types";
import { serializeFile } from "./serialize";
import { join } from "node:path";

export const initFragment = async (config: VaultConfig, piece: Piece): Promise<Fragment> => {
  const uuid = crypto.randomUUID();
  const filePath = join(config.root, "fragments", `${piece.key}.md`);

  if (await Bun.file(filePath).exists()) {
    throw new VaultError(
      "FILE_ALREADY_EXISTS",
      `Cannot initialize fragment: file already exists at "${filePath}"`,
      { filePath, reason: "A fragment with this key already exists in fragments/" },
    );
  }

  const updatedAt = new Date();
  const fragment: Fragment = {
    uuid,
    key: piece.key,
    isDiscarded: false,
    readyStatus: 0,
    properties: {},
    notes: [],
    references: [],
    content: piece.content,
    contentHash: "",
    updatedAt,
  };

  const serialized = serializeFile({
    frontmatter: {
      uuid,
      updatedAt: updatedAt.toISOString(),
      readyStatus: 0,
      notes: [],
      references: [],
    },
    body: piece.content,
  });

  await Bun.write(filePath, serialized);

  return fragment;
};
