import { useNavigate, useParams } from "@tanstack/react-router";
import type { Cycle, FragmentSummary, Sequence, Violation } from "@api/generated/maskorAPI.schemas";
import { FragmentDetailPanel } from "./FragmentDetailPanel";
import { ProjectWarningsPanel } from "./ProjectWarningsPanel";

type Props = {
  fragment: FragmentSummary | undefined;
  sequences: Sequence[];
  violations: Violation[];
  cycles: Cycle[];
  fragmentByUuid: Map<string, FragmentSummary>;
  // Full markdown body of the selected fragment (from the bulk-content endpoint),
  // enabling in-context editing of the same fragment shown in the spine.
  selectedContent?: string;
  onSaveContent?: (fragmentUuid: string, content: string) => Promise<void> | void;
  // When set, the selected fragment is placed in the active sequence and can be
  // removed from it (returned to the pool).
  onRemoveFragment?: (fragmentUuid: string) => void;
};

export const RightSidebar = ({
  fragment,
  sequences,
  violations,
  cycles,
  fragmentByUuid,
  selectedContent,
  onSaveContent,
  onRemoveFragment,
}: Props) => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate();

  const handleNavigateToSequence = (sequenceId: string) => {
    void navigate({
      to: "/projects/$projectId/overview",
      params: { projectId },
      // Preserve the current detail level if one is in the URL; leave it
      // undefined otherwise so the persisted per-project preference resolves.
      // Narrow `prev` to only the keys the target route expects.
      search: (prev) => ({ detail: prev.detail, sequence: sequenceId }),
    });
  };

  return (
    <aside className="flex flex-col w-64 shrink-0 border-l border-border overflow-y-auto">
      {fragment ? (
        <FragmentDetailPanel
          fragment={fragment}
          sequences={sequences}
          violations={violations}
          fragmentByUuid={fragmentByUuid}
          projectId={projectId}
          selectedContent={selectedContent}
          onSaveContent={onSaveContent}
          onRemoveFragment={onRemoveFragment}
          onOpen={() =>
            void navigate({
              to: "/projects/$projectId/fragments/$fragmentId",
              params: { projectId, fragmentId: fragment.uuid },
            })
          }
        />
      ) : (
        <ProjectWarningsPanel
          sequences={sequences}
          violations={violations}
          cycles={cycles}
          fragmentByUuid={fragmentByUuid}
          onNavigateToSequence={handleNavigateToSequence}
        />
      )}
    </aside>
  );
};
