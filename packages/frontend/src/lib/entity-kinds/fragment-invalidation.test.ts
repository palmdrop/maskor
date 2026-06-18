import { describe, it, expect } from "vitest";
import { buildEntityOptimisticConfig } from "./useEntityFieldSave";
import { ENTITY_HOOKS } from "./entityHooks";
import {
  getListFragmentsQueryKey,
  getListFragmentSummariesQueryKey,
} from "@api/generated/fragments/fragments";

// Regression: a fragment rename changes `key`, which the Overview's left column + spine read from
// the fragment *summaries* list. The watcher hash-guards on file content (the key is the filename,
// not part of the hash), so a rename emits no `fragment:synced` SSE event — the summaries query must
// therefore be invalidated by the update mutation itself, or the Overview shows the stale name until
// a manual refresh.
describe("fragment update invalidation", () => {
  it("invalidates both the fragment list and the fragment summaries list", () => {
    const config = buildEntityOptimisticConfig<"fragment">(
      ENTITY_HOOKS.fragment,
      "proj-1",
      "uuid-1",
    );

    const invalidatedKeys = (config.invalidate ?? []).map((key) => JSON.stringify(key));

    expect(invalidatedKeys).toContain(JSON.stringify(getListFragmentsQueryKey("proj-1")));
    expect(invalidatedKeys).toContain(JSON.stringify(getListFragmentSummariesQueryKey("proj-1")));
  });
});
