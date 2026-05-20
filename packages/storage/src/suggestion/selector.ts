import type { SuggestionWeights } from "./weights";
import { DEFAULT_WEIGHTS } from "./weights";
import type { FragmentStats } from "./stats-repo";

export type EligibleFragment = {
  uuid: string;
  readiness: number;
};

type SelectInput = {
  eligibleFragments: EligibleFragment[];
  stats: Map<string, FragmentStats>;
  rng: () => number;
  weights?: SuggestionWeights;
};

// Pure selection function — no I/O. RNG is injected for testability (seed-able in tests).
export const selectNextSuggestion = ({
  eligibleFragments,
  stats,
  rng,
  weights = DEFAULT_WEIGHTS,
}: SelectInput): string | null => {
  if (eligibleFragments.length === 0) return null;

  const scored = eligibleFragments.map((fragment) => {
    const fragmentStats = stats.get(fragment.uuid);
    const voluntaryOpenCount = fragmentStats?.voluntaryOpenCount ?? 0;
    const avoidanceCount = fragmentStats?.avoidanceCount ?? 0;
    const editCount = fragmentStats?.editCount ?? 0;

    const score =
      weights.readinessWeight * (1 - fragment.readiness) -
      weights.voluntaryOpenPenalty * voluntaryOpenCount -
      weights.avoidancePenalty * avoidanceCount +
      weights.editCountWeight * (1 / (editCount + 1));

    // Clamp to a small positive floor so every fragment remains selectable.
    return { uuid: fragment.uuid, score: Math.max(score, 0.01) };
  });

  // Weighted random selection.
  const totalWeight = scored.reduce((sum, item) => sum + item.score, 0);
  let threshold = rng() * totalWeight;

  for (const item of scored) {
    threshold -= item.score;
    if (threshold <= 0) {
      return item.uuid;
    }
  }

  return scored[scored.length - 1]!.uuid;
};
