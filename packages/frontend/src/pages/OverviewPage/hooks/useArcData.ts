import { useState, useCallback, useMemo } from "react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { resolveAspectColor } from "../utils/aspectColors";

interface UseArcDataParams {
  fragmentByUuid: Map<string, FragmentSummary>;
  aspectList: Array<{ key: string; color?: string }>;
  allFragments: FragmentSummary[];
  placedFragmentUuids: string[];
}

// Arc colour + visibility state for the vertical Overview. The arc curves
// themselves are built per-width by the consumers (horizontal overlay, vertical
// strip) from `arcLayout` x-coordinates; this hook owns only the cross-cutting
// concerns: the deterministic colour map, which aspects are toggled off, and the
// set of aspect keys that actually appear (with a weight) on placed fragments.
export const useArcData = ({
  fragmentByUuid,
  aspectList,
  allFragments,
  placedFragmentUuids,
}: UseArcDataParams) => {
  const [hiddenAspectKeys, setHiddenAspectKeys] = useState<Set<string>>(new Set());

  const toggleAspectVisibility = useCallback((aspectKey: string) => {
    setHiddenAspectKeys((previous) => {
      const next = new Set(previous);
      if (next.has(aspectKey)) next.delete(aspectKey);
      else next.add(aspectKey);
      return next;
    });
  }, []);

  const colorByAspectKey = useMemo(() => {
    const map = new Map<string, string>();
    const seenKeys = new Set<string>();
    for (const aspect of aspectList) {
      map.set(aspect.key, resolveAspectColor(aspect.key, aspect.color));
      seenKeys.add(aspect.key);
    }
    // Cover aspect keys present on fragments but not (yet) in the aspects index —
    // fall back to the deterministic palette so every plotted point has a colour.
    for (const fragment of allFragments) {
      for (const aspectKey of Object.keys(fragment.aspects)) {
        if (!seenKeys.has(aspectKey)) {
          map.set(aspectKey, resolveAspectColor(aspectKey, undefined));
          seenKeys.add(aspectKey);
        }
      }
    }
    return map;
  }, [aspectList, allFragments]);

  // Aspect keys with at least one weighted point among the placed fragments,
  // sorted for a stable legend order regardless of arc width.
  const arcAspectKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const fragmentUuid of placedFragmentUuids) {
      const fragment = fragmentByUuid.get(fragmentUuid);
      if (!fragment) continue;
      for (const [aspectKey, value] of Object.entries(fragment.aspects)) {
        if (value.weight !== undefined) keys.add(aspectKey);
      }
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [placedFragmentUuids, fragmentByUuid]);

  return {
    colorByAspectKey,
    hiddenAspectKeys,
    toggleAspectVisibility,
    arcAspectKeys,
  };
};
