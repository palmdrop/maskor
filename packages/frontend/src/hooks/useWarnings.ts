import { useListWarnings } from "@api/generated/warnings/warnings";
import type { VaultWarning } from "@api/generated/maskorAPI.schemas";

// Unwraps the orval list-warnings envelope into a plain array. Live-invalidated by
// useVaultEvents on `vault:warning` (broad project-scoped query invalidation).
export const useWarnings = (
  projectId: string,
): { warnings: VaultWarning[]; isLoading: boolean } => {
  const { data: envelope, isLoading } = useListWarnings(projectId);
  const warnings = envelope?.status === 200 ? envelope.data : [];
  return { warnings, isLoading };
};
