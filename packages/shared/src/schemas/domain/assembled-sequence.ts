export type AssembledFragment = {
  uuid: string;
  key: string;
  content: string;
};

export type AssembledSection = {
  uuid: string;
  name: string;
  fragments: AssembledFragment[];
};

export type AssembledSequence = {
  sequenceUuid: string;
  sequenceName: string;
  isMain: boolean;
  sections: AssembledSection[];
};
