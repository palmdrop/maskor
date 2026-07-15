// Sequence names are free-form display strings — unlike entity keys there is no
// character restriction and no uniqueness. The only shape rule is non-empty after
// trimming (the route-level `min(1)` alone lets a whitespace-only name through).
// Callers wrap the thrown Error in their own domain error, mirroring
// `validateEntityKey`.
export const validateSequenceName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed.length) {
    throw new Error("Sequence name must not be empty");
  }
  return trimmed;
};
