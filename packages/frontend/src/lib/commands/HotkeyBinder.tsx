import { useEffect } from "react";
import { useCommandsContext } from "./CommandsProvider";
import type { CommandDef } from "./types";

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
  map: ReadonlyMap<string, CommandDef>,
  event: KeyboardEvent,
): CommandDef[] => {
  const candidates: CommandDef[] = [];
  for (const def of map.values()) {
    if (!def.hotkey || def.disabledReason) continue;
    const parsed = parseHotkey(def.hotkey);
    if (isUnmodifiedSingleKey(parsed) && isTextInput(document.activeElement)) continue;
    if (matchesEvent(parsed, event)) candidates.push(def);
  }
  return candidates;
};

export const HotkeyBinder = () => {
  const { getMap, run, getActiveScopes } = useCommandsContext();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const candidates = matchingHotkeyCandidates(getMap(), event);
      if (candidates.length === 0) return;

      let winner = candidates[0];
      if (candidates.length > 1) {
        // Innermost-active-scope wins on conflict. Build a quick lookup from
        // scope label to mount order; commands not in an active scope fall back
        // to a sentinel so globals lose to scoped commands but win against
        // nothing.
        const scopeOrderByLabel = new Map<string, number>();
        for (const active of getActiveScopes()) {
          scopeOrderByLabel.set(active.meta.label, active.mountOrder);
        }
        const order = (def: CommandDef): number =>
          def.scope === "global" ? -1 : (scopeOrderByLabel.get(def.scope) ?? -2);
        winner = candidates.reduce((a, b) => (order(b) > order(a) ? b : a));
        if (import.meta.env.DEV) {
          const ids = candidates.map((c) => c.id).join(", ");
          console.warn(
            `[commands] Hotkey "${winner.hotkey}" matched multiple commands (${ids}). Innermost-active-scope wins: "${winner.id}".`,
          );
        }
      }

      event.preventDefault();
      run(winner.id);
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [getMap, run, getActiveScopes]);

  return null;
};
