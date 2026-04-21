export type Section = {
  name: string;
  uuid: string;
  fragments: {
    fragmentUUID: string;
    position: number;
  }[];
};

export type Sequence = {
  name: string;
  uuid: string;
  sections: Section[];
};
