import type { FragmentUUID } from "./fragment";

export type SectionUUID = string;
export type SequenceUUID = string;

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
  uuid: SequenceUUID;
  sections: Section[];
};
