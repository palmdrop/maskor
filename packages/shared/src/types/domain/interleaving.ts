import type { Brand } from "ts-brand";
import type { UUID } from "../utils/uuid";

export type InterleavingUUID = Brand<UUID, "interleaving">;

export type Interleaving = {
  uuid: InterleavingUUID;
  // TODO: No idea how to configure this...?
  // interactions between arcs, aspects
};
