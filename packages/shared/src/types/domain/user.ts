import type { Brand } from "ts-brand";
import type { UUID } from "../utils";

export type UserUUID = Brand<UUID, "user">;

export type User = {
  uuid: UserUUID;
  name: string;
};