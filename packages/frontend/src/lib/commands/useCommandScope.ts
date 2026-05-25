import { useEffect, useRef } from "react";
import type { Scope, ContextOf } from "./types";
import { useCommandsContext } from "./CommandsProvider";

// Publishes a scope's context while the component is mounted. The provider keeps
// a ref to the latest published value; on every render this hook updates the ref
// so commands always read the current ctx at run time.
//
// Publishing happens *during render*, not in useEffect, for two reasons:
//   1. Tree order: parents render before children, so the mount-order counter
//      naturally orders innermost-deepest with the highest number. The palette
//      and hotkey binder sort descending, putting innermost first.
//   2. Visibility on the same render: tests and reactive consumers see the
//      scope as active as soon as the component renders, not one tick later.
//
// Idempotency: a ref guards against publishing more than once per mount; the
// unpublish callback is invoked on unmount via useEffect cleanup. In StrictMode
// dev double-mounting, cleanup runs between the two renders so the second
// render publishes cleanly.
//
// Singleton enforcement: if another mounted component already published this
// scope, the provider warns in dev. Last-publish-wins in prod.
export const useCommandScope = <S extends Scope<unknown>>(scope: S, ctx: ContextOf<S>) => {
  const { publishScope } = useCommandsContext();
  const ctxRef = useRef<unknown>(ctx);
  ctxRef.current = ctx;

  const unpublishRef = useRef<(() => void) | null>(null);
  if (unpublishRef.current === null) {
    unpublishRef.current = publishScope(scope, ctxRef);
  }

  useEffect(() => {
    return () => {
      unpublishRef.current?.();
      unpublishRef.current = null;
    };
  }, []);
};
