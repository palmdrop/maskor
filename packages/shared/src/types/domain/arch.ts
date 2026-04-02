import type { Brand } from "ts-brand";
import type { UUID } from "../utils";
import type { AspectUUID } from "./aspect";

export type ArchUUID = Brand<UUID, "arch">;

export type Arch = {
  uuid: ArchUUID;
  aspectUUID: AspectUUID;
  movement: number[];
};
