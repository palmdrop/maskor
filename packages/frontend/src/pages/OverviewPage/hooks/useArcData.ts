import { useState, useCallback, useRef, useMemo } from "react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { resolveAspectColor } from "../utils/aspectColors";
import { buildArcSeries, type ArcSeries } from "../utils/arcData";
import { ARC_PANEL_HEIGHT } from "../components/ArcPanel";
import type { computeSequenceLayout } from "../utils/layout";

interface UseArcDataParams {
  activeDragId: string | null;
  sequenceLayout: ReturnType<typeof computeSequenceLayout>;
  fragmentByUuid: Map<string, FragmentSummary>;
  aspectList: Array<{ key: string; color?: string }>;
  allFragments: FragmentSummary[];
}

export const useArcData = ({
  activeDragId,
  sequenceLayout,
  fragmentByUuid,
  aspectList,
  allFragments,
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
    // fall back to the deterministic palette so the tile color matches the arc.
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

  // Stale-while-drag: hold the previously rendered arc series until the drag
  // ends. The user's optimistic in-flight reorderings still update tile DOM
  // positions, but the curve only catches up after `onDragEnd` clears
  // `activeDragId`. Avoids per-frame recomputation while the user drags.
  const arcSeriesCacheRef = useRef<ArcSeries[]>([]);

  // Refs for syncing horizontal scroll between the sticky arc panel wrapper and
  // the tile scroller. The arc wrapper uses overflow-x:hidden so the SVG is
  // clipped to the viewport; its scrollLeft mirrors the tile scroller so the
  // curves stay aligned with their tiles during horizontal scroll.
  const tileScrollerRef = useRef<HTMLDivElement>(null);
  const arcScrollerRef = useRef<HTMLDivElement>(null);

  const handleTileScroll = useCallback(() => {
    if (tileScrollerRef.current && arcScrollerRef.current) {
      arcScrollerRef.current.scrollLeft = tileScrollerRef.current.scrollLeft;
    }
  }, []);

  const arcSeries = useMemo<ArcSeries[]>(() => {
    if (activeDragId !== null) return arcSeriesCacheRef.current;
    const next = buildArcSeries(
      sequenceLayout.sections.flatMap((section) => section.fragmentUuids),
      fragmentByUuid,
      sequenceLayout.centerByFragmentUuid,
      ARC_PANEL_HEIGHT,
    );
    arcSeriesCacheRef.current = next;
    return next;
  }, [activeDragId, sequenceLayout, fragmentByUuid]);

  const arcAspectKeys = useMemo(() => arcSeries.map((series) => series.aspectKey), [arcSeries]);

  const visibleArcSeries = useMemo(
    () => arcSeries.filter((series) => !hiddenAspectKeys.has(series.aspectKey)),
    [arcSeries, hiddenAspectKeys],
  );

  return {
    colorByAspectKey,
    hiddenAspectKeys,
    toggleAspectVisibility,
    arcSeries,
    arcAspectKeys,
    visibleArcSeries,
    tileScrollerRef,
    arcScrollerRef,
    handleTileScroll,
  };
};
