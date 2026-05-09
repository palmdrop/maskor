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
