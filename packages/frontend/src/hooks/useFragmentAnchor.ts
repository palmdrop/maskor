import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

// The assembled markdown renders an invisible anchor node per fragment as
// `id="fragment-<id>"` (see fragment-anchor-extension). The active fragment is
// carried in the URL hash (`#fragment-<id>`) — the native browser anchor token,
// so it is shareable and restored on reload. The `<id>` is the nav payload's
// `uuid` (fragment uuid for preview, piece index for import).
const ANCHOR_PREFIX = "fragment-";

const scrollToAnchor = (anchorId: string) => {
  document
    .getElementById(`${ANCHOR_PREFIX}${anchorId}`)
    ?.scrollIntoView({ behavior: "instant", block: "start" });
};

// Reads/writes the `#fragment-<id>` hash and scrolls the matching anchor into
// view. TanStack Router natively scrolls to the hash element after navigation
// (and on reload), but preview/import content is fetched async, so on a deep
// link the element does not exist yet when the router tries — `ready` lets us
// scroll once the assembled markdown has rendered.
export const useFragmentAnchor = ({ ready }: { ready: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // router-core stores the hash without its leading `#`.
  const activeAnchorId = location.hash.startsWith(ANCHOR_PREFIX)
    ? location.hash.slice(ANCHOR_PREFIX.length)
    : null;

  // Deep-link / reload: scroll once the content the anchor points at exists.
  useEffect(() => {
    if (!ready || !activeAnchorId) return;
    scrollToAnchor(activeAnchorId);
  }, [ready, activeAnchorId]);

  const navigateToAnchor = useCallback(
    (anchorId: string) => {
      // Preserve the current path + search (e.g. the preview `?sequence=`); only
      // the hash changes. The explicit scroll keeps the jump deterministic even
      // when the element already exists; the router's native hash scroll covers
      // the URL/reload path.
      void navigate({
        to: ".",
        search: (previous) => previous,
        hash: `${ANCHOR_PREFIX}${anchorId}`,
        replace: true,
      });
      scrollToAnchor(anchorId);
    },
    [navigate],
  );

  return { activeAnchorId, navigateToAnchor };
};
