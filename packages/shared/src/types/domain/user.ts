import type { Brand } from "ts-brand";
import type { UUID } from "../utils/uuid";

export type UserUUID = Brand<UUID, "user">;

// NOTE: for now, no need to worry about user, it's all local and projects are managed by Obsidian vaults.
export type User = {
  uuid: UserUUID;
  name: string;
};
