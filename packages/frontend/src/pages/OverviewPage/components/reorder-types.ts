// Shared view-model types for the Overview reorder list (left working column).

export type SelectModifiers = { toggle?: boolean; range?: boolean };

export interface SectionData {
  uuid: string;
  name: string;
  fragmentUuids: string[];
}

export type SectionRef = { uuid: string; name: string };
