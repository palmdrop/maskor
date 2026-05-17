Use the generated orval client for every API call. Do not hand-roll `useMutation` / `useQuery` against `customFetch` — that bypasses generated types and route schemas.

Generated hooks live under `src/api/generated/<tag>/<tag>.ts` (one file per OpenAPI tag), e.g. `useCreateProject`, `useUpdateProject`. Schemas live in `src/api/generated/maskorAPI.schemas.ts`.

When you add or change an API route (new endpoint, new field, new mode), regenerate the client:

1. Start the API: `bun run dev` in `packages/api`.
2. From `packages/frontend`, run `bun run codegen`.
3. Use the regenerated hook in the frontend. Delete any hand-rolled mutation that the regenerated hook replaces.

If a hook you expect isn't generated, the route is either missing from the OpenAPI spec or codegen wasn't re-run against an up-to-date server — fix that first; don't work around it with a custom mutation.

Example to mirror: `RenameProjectDialog.tsx` uses `useUpdateProject` from the generated client.
