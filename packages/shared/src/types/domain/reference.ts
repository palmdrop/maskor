import type { Brand } from "ts-brand";
import type { UUID } from "../utils";

export type ReferenceUUID = Brand<UUID, "reference">;

export type Reference = {
  uuid: ReferenceUUID;
  name: string;
  content: string;
};
