import { defineScope, defineScopeCommand } from "../define";

export interface FragmentMetadataContext {
  attachAspect: (aspectKey: string) => void;
  detachAspect: (aspectKey: string) => void;
  getAvailableAspects: () => string[];
  getAttachedAspects: () => string[];
}

export const fragmentMetadataScope = defineScope<FragmentMetadataContext>("fragment-metadata", {
  label: "Fragment metadata",
});

const attachAspect = defineScopeCommand<
  "fragment-metadata",
  "fragment-metadata:attach-aspect",
  FragmentMetadataContext,
  string
>(fragmentMetadataScope, {
  id: "fragment-metadata:attach-aspect",
  label: "Attach aspect",
  category: "attach",
  arg: (ctx) => ({
    items: ctx.getAvailableAspects(),
    getKey: (item) => item,
    getLabel: (item) => item,
    placeholder: "Choose aspect…",
  }),
  run: (ctx, aspectKey) => {
    if (!aspectKey) return;
    ctx.attachAspect(aspectKey);
  },
});

const detachAspect = defineScopeCommand<
  "fragment-metadata",
  "fragment-metadata:detach-aspect",
  FragmentMetadataContext,
  string
>(fragmentMetadataScope, {
  id: "fragment-metadata:detach-aspect",
  label: "Detach aspect",
  category: "attach",
  arg: (ctx) => ({
    items: ctx.getAttachedAspects(),
    getKey: (item) => item,
    getLabel: (item) => item,
    placeholder: "Choose aspect…",
  }),
  run: (ctx, aspectKey) => {
    if (!aspectKey) return;
    ctx.detachAspect(aspectKey);
  },
});

export const fragmentMetadataCommands = [attachAspect, detachAspect] as const;
