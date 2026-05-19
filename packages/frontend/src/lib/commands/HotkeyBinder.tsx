import { useEffect } from "react";
import { useCommandsContext } from "./CommandsProvider";

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
    // "mod" accepts Cmd (Mac) or Ctrl (other platforms) — at least one must be held.
    if (!event.metaKey && !event.ctrlKey) return false;
  } else {
    // No mod key — metaKey must not be held; explicit ctrl must match exactly.
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

export const HotkeyBinder = () => {
  const { getMap, run } = useCommandsContext();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      for (const def of getMap().values()) {
        if (!def.hotkey || def.disabledReason) continue;

        const parsed = parseHotkey(def.hotkey);

        if (isUnmodifiedSingleKey(parsed) && isTextInput(document.activeElement)) continue;

        if (matchesEvent(parsed, event)) {
          event.preventDefault();
          run(def.id);
          return;
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [getMap, run]);

  return null;
};
