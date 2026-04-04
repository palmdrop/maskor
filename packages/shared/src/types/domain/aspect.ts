import type { Brand } from "ts-brand";
import type { UUID } from "../utils/uuid";

export type AspectUUID = Brand<UUID, "aspect">;

export type Aspect = {
  uuid: AspectUUID;
  key: string;
  category?: string;
  description?: string;
  // stored as titles at the file layer; resolved to UUIDs at the DB layer
  notes: string[];
};
