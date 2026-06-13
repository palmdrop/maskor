import { defineScope, defineScopeCommand } from "../define";

// Published by the FragmentListPage. Hosts the parameterized "Split fragment…"
// entry point: pick any non-discarded fragment from the list, then open the
// shared split dialog for it.
export interface FragmentListContext {
  splittableFragments: ReadonlyArray<{ uuid: string; key: string }>;
  openSplit: (fragmentUuid: string) => void;
}

export const fragmentListScope = defineScope<FragmentListContext>("fragment-list", {
  label: "Fragments",
});

const splitFragment = defineScopeCommand(fragmentListScope, {
  id: "fragment-list:split-fragment",
  label: "Split fragment…",
  category: "create",
  disabled: (ctx) => (ctx.splittableFragments.length > 0 ? undefined : "No fragments to split"),
  arg: {
    items: (ctx) => ctx.splittableFragments,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Split fragment…",
  },
  run: (ctx, target) => ctx.openSplit(target.uuid),
});

export const fragmentListCommands = [splitFragment] as const;
