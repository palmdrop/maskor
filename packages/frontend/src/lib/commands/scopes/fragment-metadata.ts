import { defineScope, defineScopeCommand } from "../define";

// Notes are no longer a fragment attachment (margins replaced them — ADR 0007); only aspects and
// references remain attachable from the metadata form.
type EntityKind = "aspect" | "reference";

export interface FragmentMetadataContext {
  attachEntity: (kind: EntityKind, key: string) => void;
  detachEntity: (kind: EntityKind, key: string) => void;
  getAvailableEntities: (kind: EntityKind) => string[];
  getAttachedEntities: (kind: EntityKind) => string[];
}

export const fragmentMetadataScope = defineScope<FragmentMetadataContext>("fragment-metadata", {
  label: "Fragment metadata",
});

const attachAspect = defineScopeCommand(fragmentMetadataScope, {
  id: "fragment-metadata:attach-aspect",
  label: "Attach aspect",
  category: "attach",
  disabled: (ctx) =>
    ctx.getAvailableEntities("aspect").length === 0 ? "No aspects to attach" : undefined,
  arg: {
    items: (ctx): string[] => ctx.getAvailableEntities("aspect"),
    getKey: (item) => item,
    getLabel: (item) => item,
    placeholder: "Choose aspect…",
  },
  run: (ctx, aspectKey) => {
    if (!aspectKey) return;
    ctx.attachEntity("aspect", aspectKey);
  },
});

const detachAspect = defineScopeCommand(fragmentMetadataScope, {
  id: "fragment-metadata:detach-aspect",
  label: "Detach aspect",
  category: "attach",
  disabled: (ctx) =>
    ctx.getAttachedEntities("aspect").length === 0 ? "No attached aspects" : undefined,
  arg: {
    items: (ctx): string[] => ctx.getAttachedEntities("aspect"),
    getKey: (item) => item,
    getLabel: (item) => item,
    placeholder: "Choose aspect…",
  },
  run: (ctx, aspectKey) => {
    if (!aspectKey) return;
    ctx.detachEntity("aspect", aspectKey);
  },
});

const attachReference = defineScopeCommand(fragmentMetadataScope, {
  id: "fragment-metadata:attach-reference",
  label: "Attach reference",
  category: "attach",
  disabled: (ctx) =>
    ctx.getAvailableEntities("reference").length === 0 ? "No references to attach" : undefined,
  arg: {
    items: (ctx): string[] => ctx.getAvailableEntities("reference"),
    getKey: (item) => item,
    getLabel: (item) => item,
    placeholder: "Choose reference…",
  },
  run: (ctx, aspectKey) => {
    if (!aspectKey) return;
    ctx.attachEntity("reference", aspectKey);
  },
});

const detachReference = defineScopeCommand(fragmentMetadataScope, {
  id: "fragment-metadata:detach-reference",
  label: "Detach reference",
  category: "attach",
  disabled: (ctx) =>
    ctx.getAttachedEntities("reference").length === 0 ? "No attached references" : undefined,
  arg: {
    items: (ctx): string[] => ctx.getAttachedEntities("reference"),
    getKey: (item) => item,
    getLabel: (item) => item,
    placeholder: "Choose reference…",
  },
  run: (ctx, aspectKey) => {
    if (!aspectKey) return;
    ctx.detachEntity("reference", aspectKey);
  },
});

export const fragmentMetadataCommands = [
  attachAspect,
  detachAspect,
  attachReference,
  detachReference,
] as const;
