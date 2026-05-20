export type SuggestionWeights = {
  readinessWeight: number;
  voluntaryOpenPenalty: number;
  avoidancePenalty: number;
  editCountWeight: number;
};

// Composite score formula:
//   score = readinessWeight * (1 - readiness)
//         - voluntaryOpenPenalty * voluntaryOpenCount
//         - avoidancePenalty * avoidanceCount
//         + editCountWeight * (1 / (editCount + 1))
// Higher score = more likely to be selected. All scores are clamped to a minimum of 0.01
// so every eligible fragment remains selectable regardless of signals.
// These are internal constants; they are not exposed to users.
export const DEFAULT_WEIGHTS: SuggestionWeights = {
  readinessWeight: 2.0,
  voluntaryOpenPenalty: 0.3,
  avoidancePenalty: 0.2,
  editCountWeight: 0.5,
};
