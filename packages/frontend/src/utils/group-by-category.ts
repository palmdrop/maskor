export type CategoryGroup<T> = { category: string | null; items: T[] };

export const groupByCategory = <T,>(
  items: T[],
  getCategory: (item: T) => string | null | undefined,
): CategoryGroup<T>[] => {
  const groupMap = new Map<string | null, T[]>();

  for (const item of items) {
    const category = getCategory(item) ?? null;
    if (!groupMap.has(category)) groupMap.set(category, []);
    groupMap.get(category)!.push(item);
  }

  const nullItems = groupMap.get(null) ?? [];
  const otherEntries = [...groupMap.entries()]
    .filter(([key]) => key !== null)
    .sort(([a], [b]) => a!.localeCompare(b!));

  const result: CategoryGroup<T>[] = [];
  if (nullItems.length > 0) result.push({ category: null, items: nullItems });
  for (const [category, groupItems] of otherEntries) {
    result.push({ category, items: groupItems });
  }
  return result;
};
