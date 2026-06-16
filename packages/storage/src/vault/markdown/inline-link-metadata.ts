import type { AspectWeights, Fragment } from "@maskor/shared";
import { deriveInlineLinkMetadata } from "@maskor/shared";

// Auto-sync inline `[[references/…]]` / `[[aspects/…]]` links in a fragment body into the fragment's
// metadata (`specifications/document-links.md`). Idempotent: applying it twice yields the same result,
// so the watcher's hash guard fires on the write-back.
//
// Rules:
//   - References: every inline-linked reference is added to the list (deduped). References are never
//     auto-removed — form-curated attachments survive incidental body edits.
//   - Aspects: every inline-linked aspect is added at weight 0 if absent (existing weights untouched).
//   - Aspect reaping (`reapAspects`): an aspect at weight 0 with no remaining inline link is dropped.
//     Weight 0 is treated as "uncommitted." Gated on a body change so a pure metadata save never reaps
//     a weight-0 aspect the user just set via the form — the reap only follows an inline link going
//     away. Non-zero weights are always preserved. (Notes are not a fragment attachment — ADR 0007.)
export const applyInlineLinkMetadata = (fragment: Fragment, reapAspects: boolean): Fragment => {
  const { referenceKeys, aspectKeys } = deriveInlineLinkMetadata(fragment.content);

  const references = [...fragment.references];
  for (const key of referenceKeys) {
    if (!references.includes(key)) references.push(key);
  }

  const inlineAspectKeys = new Set(aspectKeys);
  const aspects: AspectWeights = {};
  for (const [key, value] of Object.entries(fragment.aspects)) {
    if (value === undefined) continue;
    if (reapAspects && value.weight === 0 && !inlineAspectKeys.has(key)) continue;
    aspects[key] = value;
  }
  for (const key of aspectKeys) {
    if (!(key in aspects)) aspects[key] = { weight: 0 };
  }

  return { ...fragment, references, aspects };
};
