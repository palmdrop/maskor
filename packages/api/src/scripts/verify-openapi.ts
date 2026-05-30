// Fails if the committed OpenAPI snapshot is out of sync with the route
// definitions. Wired into `bun run verify` (root) so stale snapshots can't
// merge. Compares in-process — no temp file, no running server, no git
// dependency. See references/plans/offline-openapi-codegen.md.
import { readFile } from "node:fs/promises";
import { renderOpenAPISnapshot, SNAPSHOT_PATH } from "./generate-openapi";

const main = async (): Promise<void> => {
  const expected = renderOpenAPISnapshot();
  const committed = await readFile(SNAPSHOT_PATH, "utf-8").catch(() => null);

  if (committed === expected) {
    return;
  }

  console.error(
    "OpenAPI snapshot is out of sync with the route definitions.\n" +
      "Run `bun run generate-openapi` (or root `bun run codegen`) and commit the result.",
  );
  process.exit(1);
};

await main();
