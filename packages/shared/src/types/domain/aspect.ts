export type AspectUUID = string;

export type Aspect = {
  uuid: AspectUUID;
  key: string;
  category?: string;
  description?: string;
  // stored as titles at the file layer; resolved to UUIDs at the DB layer
  notes: string[];
};
