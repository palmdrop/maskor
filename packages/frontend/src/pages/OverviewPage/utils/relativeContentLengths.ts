// Relative content lengths for the spine's title-mode length bars: each placed
// fragment's content length as a fraction of the longest placed fragment's
// (0, 1]. Fragments whose content has not loaded yet are omitted rather than
// reported as zero-length.
export const computeRelativeContentLengths = (
  fragmentUuids: readonly string[],
  contentByFragmentUuid: ReadonlyMap<string, string>,
): Map<string, number> => {
  const lengths = new Map<string, number>();
  for (const fragmentUuid of fragmentUuids) {
    const content = contentByFragmentUuid.get(fragmentUuid);
    if (content !== undefined) {
      lengths.set(fragmentUuid, content.length);
    }
  }

  const maxLength = Math.max(0, ...lengths.values());
  if (maxLength === 0) return new Map();

  const ratios = new Map<string, number>();
  for (const [fragmentUuid, length] of lengths) {
    ratios.set(fragmentUuid, length / maxLength);
  }
  return ratios;
};
