import type { Brand } from "ts-brand";
import type { Aspect } from "./aspect.ts";
import type { UUID } from "../utils.ts";
import type { NoteUUID } from "./note.ts";
import type { Pool /* PoolUUID */ } from "./pool.ts";
import type { Markdown } from "../markdown.ts";
import type { ReferenceUUID } from "./reference.ts";

export type FragmentUUID = Brand<UUID, "fragment">;

export type FragmentProperties = {
  [key: string]: {
    aspect: Aspect; // or just AspectUUID?
    weight: number;
  };
};

// any value between 0 and 1. 0 = not ready at all, 1 = fully ready
export type ReadyStatus = number;

export type Fragment = {
  version: number;
  properties: FragmentProperties;
  uuid: string;
  contentHash: string;
  title: string;
  updatedAt: Date;
  notes: NoteUUID[];
  references: ReferenceUUID[];
  pool: Pool; // maybe just PoolType?
  readyStatus: number;
  // TODO: add links?

  content: Markdown; // markdown
};
