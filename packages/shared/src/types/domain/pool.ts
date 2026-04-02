import type { Brand } from "ts-brand";
import type { UUID } from "../utils";

// export type PoolUUID = Brand<UUID, "pool">;

export type Pool = 'discarded' | 'incomplete' | 'unplaced' | 'unprocessed';

/*
export type Pool = {
  uuid: PoolUUID;
  name: string;
  type: PoolType
}

*/