// Layout-stable pending placeholder. A blank shell that fills the content area
// so a loading view occupies the same box as the ready view — no flicker, no
// spinner, and the persisted-scroll container's dimensions don't shift between
// placeholder and content. Shown by the router's defaultPendingComponent and by
// the app Suspense fallback.
export const ViewPending = () => (
  <div className="h-full w-full" aria-busy="true" data-testid="view-pending" />
);
