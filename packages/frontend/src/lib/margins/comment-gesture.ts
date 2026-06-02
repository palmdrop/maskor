// Resolve which marker the "Comment this block" gesture should target, enforcing one comment per
// block (ADR 0008): if the block already carries a marker, reuse it (the gesture focuses the
// existing comment) and inject nothing; otherwise mint a fresh marker and inject it.
export const resolveCommentTarget = (
  existingMarkerId: string | null,
  mintMarkerId: () => string,
): { markerId: string; inject: boolean } =>
  existingMarkerId
    ? { markerId: existingMarkerId, inject: false }
    : { markerId: mintMarkerId(), inject: true };
