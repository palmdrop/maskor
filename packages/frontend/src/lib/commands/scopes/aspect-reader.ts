import { defineScope, defineScopeCommand } from "../define";

export interface AspectReaderContext {
  // Keys referenced by weight on the fragment but with no aspect entity yet — the candidates for
  // one-click creation from the reader. Drives the palette picker and the disabled state.
  orphanedAspectKeys: string[];
  // Create the aspect for an orphaned key (rejects on failure — see `onFailure`).
  createAspect: (aspectKey: string) => Promise<void>;
}

export const aspectReaderScope = defineScope<AspectReaderContext>("aspect-reader", {
  label: "Aspect reader",
});

const createAspect = defineScopeCommand(aspectReaderScope, {
  id: "aspect-reader:create-aspect",
  label: "Create aspect",
  category: "create",
  onFailure: "Failed to create aspect.",
  disabled: (ctx) =>
    ctx.orphanedAspectKeys.length === 0 ? "No orphaned aspects to create" : undefined,
  arg: {
    items: (ctx): string[] => ctx.orphanedAspectKeys,
    getKey: (item) => item,
    getLabel: (item) => item,
    placeholder: "Choose aspect to create…",
  },
  // Return the primitive's promise so a rejected create reaches the command runner's `onFailure`.
  run: (ctx, aspectKey) => {
    if (!aspectKey) return;
    return ctx.createAspect(aspectKey);
  },
});

export const aspectReaderCommands = [createAspect] as const;
