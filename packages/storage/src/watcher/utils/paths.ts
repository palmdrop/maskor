// Converts a vault-root-relative path to entity-relative by stripping the entity prefix.
// e.g. "fragments/the-bridge.md" → "the-bridge.md"
//      "fragments/discarded/the-bridge.md" → "discarded/the-bridge.md"
export const toEntityRelativePath = (vaultRelativePath: string, entityPrefix: string): string => {
  return vaultRelativePath.slice(entityPrefix.length);
};
