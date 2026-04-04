import type { Brand } from "ts-brand";
import type { UUID } from "../utils/uuid";
import type { AspectUUID } from "./aspect";

export type ArcUUID = Brand<UUID, "arch">;

export type Arc = {
  uuid: ArcUUID;
  aspectUUID: AspectUUID;
  movement: number[];
};
