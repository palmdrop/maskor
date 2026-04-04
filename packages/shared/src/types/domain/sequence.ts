import type { Brand } from "ts-brand";
import type { FragmentUUID } from "./fragment";
import type { UUID } from "../utils/uuid";

export type SectionUUID = Brand<UUID, "section">;
export type SequenceUUID = Brand<UUID, "sequence">;

export type Section = {
  name: string;
  uuid: SectionUUID;
  fragments: {
    fragmentUUID: FragmentUUID;
    position: number;
  }[];
};

export type Sequence = {
  name: string;
  uuid: SectionUUID;
  sections: Section[];
};
