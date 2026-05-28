import { useCallback } from "react";
import { useCommandsContext } from "./CommandsProvider";
import type { MergedCommandView } from "./types";

interface ParsedHotkey {
  key: string;
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

const parseHotkey = (hotkey: string): ParsedHotkey => {
  const parts = hotkey.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  return {
    key,
    mod: modifiers.includes("mod"),
    ctrl: modifiers.includes("ctrl"),
    shift: modifiers.includes("shift"),
    alt: modifiers.includes("alt"),
  };
};

const matchesEvent = (parsed: ParsedHotkey, event: KeyboardEvent): boolean => {
  if (event.key.toLowerCase() !== parsed.key) return false;

  if (parsed.mod) {
    if (!event.metaKey && !event.ctrlKey) return false;
  } else {
    if (event.metaKey) return false;
    if (parsed.ctrl !== event.ctrlKey) return false;
  }

  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  return true;
};

const isUnmodifiedSingleKey = (parsed: ParsedHotkey): boolean =>
  !parsed.mod && !parsed.ctrl && !parsed.shift && !parsed.alt;

const isTextInput = (element: Element | null): boolean => {
  if (!element) return false;
  const tag = (element as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return false;
};

const matchingHotkeyCandidates = (
  map: ReadonlyMap<string, MergedCommandView>,
  event: KeyboardEvent,
): MergedCommandView[] => {
  const candidates: MergedCommandView[] = [];
  for (const def of map.values()) {
    if (!def.hotkey || def.hotkey.length === 0) continue;
    const hotkeys = typeof def.hotkey === "string" ? [def.hotkey] : def.hotkey;
    hotkeys.forEach((hotkey) => {
      const parsed = parseHotkey(hotkey);
      if (isUnmodifiedSingleKey(parsed) && isTextInput(document.activeElement)) return;
      if (matchesEvent(parsed, event)) candidates.push(def);
    });
  }
  return candidates;
};

type UseMapEventToCommandIdOptions = {
  onNoCandidates?: (event: KeyboardEvent) => void;
  onNoEnabledCandidates?: (event: KeyboardEvent) => void;
  onWinner?: (event: KeyboardEvent, winner: MergedCommandView) => void;
};

export const useHandleCommandEvent = (options: UseMapEventToCommandIdOptions) => {
  const { getMap, getActiveScopes } = useCommandsContext();

  return useCallback(
    (event: KeyboardEvent) => {
      const candidates = matchingHotkeyCandidates(getMap(), event);
      if (candidates.length === 0) {
        options.onNoCandidates?.(event);
        return null;
      }

      const enabledCandidates = candidates.filter((candidate) => !candidate.disabledReason);

      // If a key-bind exists but the command is currently disabled, do nothing but still prevent default behavior.
      // This ensures that unexpected browser behavior is not triggered, such as print/save dialogues.
      if (enabledCandidates.length === 0) {
        options.onNoEnabledCandidates?.(event);
        return null;
      }

      let winner = enabledCandidates[0];
      if (enabledCandidates.length > 1) {
        // Innermost-active-scope wins on conflict. Build a quick lookup from
        // scope id to mount order; commands not in an active scope fall back
        // to a sentinel so globals lose to scoped commands but win against
        // nothing.
        const scopeOrderById = new Map<string, number>();
        for (const active of getActiveScopes()) {
          scopeOrderById.set(active.meta.id, active.mountOrder);
        }
        const order = (def: MergedCommandView): number =>
          def.scope === "global" ? -1 : (scopeOrderById.get(def.scope) ?? -2);
        winner = enabledCandidates.reduce((a, b) => (order(b) > order(a) ? b : a));
        if (import.meta.env.DEV) {
          const ids = enabledCandidates.map((c) => c.id).join(", ");
          console.warn(
            `[commands] Hotkey "${winner.hotkey}" matched multiple commands (${ids}). Innermost-active-scope wins: "${winner.id}".`,
          );
        }
      }

      options.onWinner?.(event, winner);
      return winner.id;
    },
    [options.onNoCandidates, options.onNoEnabledCandidates, getMap, getActiveScopes],
  );
};
