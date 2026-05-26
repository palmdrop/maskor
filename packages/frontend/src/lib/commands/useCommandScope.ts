import { useEffect, useRef } from "react";
import type { Scope } from "./types";
import { useCommandsContext } from "./CommandsProvider";

// Publishes a scope's context while the component is mounted. The provider keeps
// a ref to the latest published value; on every render this hook updates the ref
// so commands always read the current ctx at run time.
//
// Publishing happens *during render* for two reasons:
//   1. Tree order: parents render before children, so the mount-order counter
//      naturally orders innermost-deepest with the highest number. The palette
//      and hotkey binder sort descending, putting innermost first.
//   2. Visibility on the same render: tests and reactive consumers see the
//      scope as active as soon as the component renders, not one tick later.
//
// Idempotency: a ref guards against double-publishing on the same mount.
// StrictMode simulates unmount/remount via effect cleanup — the useEffect setup
// re-publishes when the cleanup cleared the ref, closing that window.
//
// Singleton enforcement: if another mounted component already published this
// scope, the provider warns in dev. Last-publish-wins in prod.
//
// The generic infers `Ctx` directly from the scope rather than going through
// `ContextOf<Scope<Ctx>>`. The phantom field on `Scope<Ctx>` is a
// `(ctx: Ctx) => void` callback, which is contravariant in `Ctx`. That made
// `Scope<ProjectShellContext>` *not* assignable to a `Scope<unknown>` bound,
// so the prior `S extends Scope<unknown>` signature rejected every concrete
// scope at the call site.
export const useCommandScope = <Ctx>(scope: Scope<Ctx>, ctx: Ctx) => {
  const { publishScope } = useCommandsContext();
  const ctxRef = useRef<unknown>(ctx);
  ctxRef.current = ctx;

  const unpublishRef = useRef<(() => void) | null>(null);
  if (unpublishRef.current === null) {
    unpublishRef.current = publishScope(scope, ctxRef);
  }

  useEffect(() => {
    // Re-publish if StrictMode's simulated unmount cleared the ref between
    // the render-phase publish and the effect running.
    if (!unpublishRef.current) {
      unpublishRef.current = publishScope(scope, ctxRef);
    }
    return () => {
      unpublishRef.current?.();
      unpublishRef.current = null;
    };
  }, [publishScope, scope]);
};
