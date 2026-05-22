export const ENTITY_KINDS = ["fragment", "note", "reference", "aspect"] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export type EntityKindMeta = {
  noun: EntityKind;
  preFillPrefix: string;
  // Field name carrying the inserted body on the extract mutation payload.
  // Aspects use `description`; the other three use `content`.
  extractBodyField: "content" | "description";
  // Param name carrying the target uuid on the append/prepend mutation input.
  insertIdParamKey: "fragmentId" | "noteId" | "referenceId" | "aspectId";
};

export const ENTITY_KIND_META: Record<EntityKind, EntityKindMeta> = {
  fragment: {
    noun: "fragment",
    preFillPrefix: "unnamed-fragment",
    extractBodyField: "content",
    insertIdParamKey: "fragmentId",
  },
  note: {
    noun: "note",
    preFillPrefix: "unnamed-note",
    extractBodyField: "content",
    insertIdParamKey: "noteId",
  },
  reference: {
    noun: "reference",
    preFillPrefix: "unnamed-reference",
    extractBodyField: "content",
    insertIdParamKey: "referenceId",
  },
  aspect: {
    noun: "aspect",
    preFillPrefix: "unnamed-aspect",
    extractBodyField: "description",
    insertIdParamKey: "aspectId",
  },
};
