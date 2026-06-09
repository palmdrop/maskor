import { Suspense, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { ViewError } from "./ViewError";
import { ViewPending } from "./ViewPending";

// Outer safety net wrapping the routed content at ProjectShellLayout. The
// per-route catch boundary (RouteErrorComponent via defaultErrorComponent)
// handles the common case of a view throwing; this catches anything thrown
// outside a route's component subtree and hosts the Suspense fallback for any
// in-render useSuspenseQuery suspension that isn't covered by a loader.
//
// Wrapping in QueryErrorResetBoundary wires Retry to the query reset so a
// failed query refetches. resetKeys on the location clears a stale error when
// the user navigates away.
export const AppErrorBoundary = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          resetKeys={[location.href]}
          fallbackRender={({ error, resetErrorBoundary }) => (
            <ViewError error={error} onRetry={resetErrorBoundary} />
          )}
        >
          <Suspense fallback={<ViewPending />}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
};
