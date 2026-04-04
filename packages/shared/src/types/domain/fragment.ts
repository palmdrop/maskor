import type { Brand } from "ts-brand";
import type { UUID } from "../utils/uuid";
import type { NoteUUID } from "./note";
import type { Pool /* PoolUUID */ } from "./pool";
import type { Markdown } from "../utils/markdown";
import type { ReferenceUUID } from "./reference";

export type FragmentUUID = Brand<UUID, "fragment">;

// Keyed by aspect key (unique name). Full Aspect resolution happens at the DB layer.
export type FragmentProperties = {
  [aspectKey: string]: {
    weight: number;
  };
};

// any value between 0 and 1. 0 = not ready at all, 1 = fully ready
export type ReadyStatus = number;

export type Fragment = {
  version: number;
  properties: FragmentProperties;
  uuid: FragmentUUID;
  contentHash: string;
  title: string;
  updatedAt: Date;
  notes: NoteUUID[];
  references: ReferenceUUID[];
  pool: Pool;
  readyStatus: number;
  // TODO: add links?

  content: Markdown;
};
