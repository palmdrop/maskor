import { useCommand } from "../useCommand";

type Params = {
  onAttachAspect: (aspectKey: string) => void;
  onDetachAspect: (aspectKey: string) => void;
  getAvailableAspects: () => string[];
  getAttachedAspects: () => string[];
};

export const useFragmentMetadataCommands = (params: Params) => {
  useCommand({
    id: "fragment-metadata:attach-aspect",
    label: "Attach aspect",
    scope: "Fragment metadata",
    category: "attach",
    disabledReason: undefined,
    arg: {
      get items() {
        return params.getAvailableAspects();
      },
      getKey: (item) => item,
      getLabel: (item) => item,
      placeholder: `Choose aspect…`,
    },
    run: (target) => {
      if (!target) {
        console.log(target);
        return;
      }

      params.onAttachAspect(target);
    },
  });

  useCommand({
    id: "fragment-metadata:detach-aspect",
    label: "Detach aspect",
    scope: "Fragment metadata",
    category: "attach",
    disabledReason: undefined,
    arg: {
      get items() {
        return params.getAttachedAspects();
      },
      getKey: (item) => item,
      getLabel: (item) => item,
      placeholder: `Choose aspect…`,
    },
    run: (target) => {
      if (!target) return;
      params.onDetachAspect(target);
    },
  });
};
