export type UpdateClassification = "renamed" | "updated" | "both" | "none";

export const classifyUpdate = (
  keyChanged: boolean,
  nonKeyChanged: boolean,
): UpdateClassification => {
  if (keyChanged && nonKeyChanged) return "both";
  if (keyChanged) return "renamed";
  if (nonKeyChanged) return "updated";
  return "none";
};

export const stringArraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return false;
  }
  return true;
};

export const aspectWeightsEqual = (
  a: Record<string, { weight: number }>,
  b: Record<string, { weight: number }>,
): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!(key in b)) return false;
    if (a[key]!.weight !== b[key]!.weight) return false;
  }
  return true;
};

export const diffStringSet = (
  before: string[],
  after: string[],
): { added: string[]; removed: string[] } => {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((item) => !beforeSet.has(item));
  const removed = before.filter((item) => !afterSet.has(item));
  return { added, removed };
};

export const diffAspectWeights = (
  before: Record<string, { weight: number }>,
  after: Record<string, { weight: number }>,
): {
  added: { key: string; weight: number }[];
  removed: string[];
  weightChanged: { key: string; from: number; to: number }[];
} => {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  const added: { key: string; weight: number }[] = [];
  const removed: string[] = [];
  const weightChanged: { key: string; from: number; to: number }[] = [];
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) {
      added.push({ key, weight: after[key]!.weight });
    } else if (before[key]!.weight !== after[key]!.weight) {
      weightChanged.push({ key, from: before[key]!.weight, to: after[key]!.weight });
    }
  }
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) {
      removed.push(key);
    }
  }
  return { added, removed, weightChanged };
};
