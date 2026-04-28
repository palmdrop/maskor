import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

const CHORD_TIMEOUT_MS = 500;

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKeyboardNav(projectId: string) {
  const navigate = useNavigate();
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingSecondRef = useRef(false);

  const SHORTCUTS = {
    f: {
      navigate: "/projects/$projectId/fragments",
      params: { projectId },
    },
    o: {
      navigate: "/projects/$projectId/overview",
      params: { projectId },
    },
    c: {
      navigate: "/projects/$projectId/config",
      params: { projectId },
    },
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTextInput(document.activeElement)) return;

      if (!awaitingSecondRef.current) {
        if (e.key === "g") {
          e.preventDefault();
          awaitingSecondRef.current = true;
          pendingRef.current = setTimeout(() => {
            awaitingSecondRef.current = false;
          }, CHORD_TIMEOUT_MS);
        }
        return;
      }

      if (pendingRef.current) clearTimeout(pendingRef.current);
      awaitingSecondRef.current = false;

      const shortcut = SHORTCUTS[e.key as keyof typeof SHORTCUTS];
      if (shortcut) {
        navigate({ to: shortcut.navigate, params: shortcut.params });
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [projectId, navigate]);
}
