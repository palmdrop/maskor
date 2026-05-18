import { useNavigate, useParams } from "@tanstack/react-router";
import type { Cycle, Sequence, Violation } from "@api/generated/maskorAPI.schemas";

type Props = {
  sequences: Sequence[];
  violations: Violation[];
  cycles: Cycle[];
  activeSequenceId: string | undefined;
};

function sequenceStatus(
  sequence: Sequence,
  violations: Violation[],
  cycles: Cycle[],
): "cycle" | "violation" | "ok" {
  if (cycles.some((c) => c.sequenceUuids.includes(sequence.uuid))) return "cycle";
  if (violations.some((v) => v.secondaryUuid === sequence.uuid)) return "violation";
  return "ok";
}

function fragmentCount(sequence: Sequence): number {
  return sequence.sections.reduce((total, section) => total + section.fragments.length, 0);
}

const StatusDot = ({ status }: { status: "cycle" | "violation" | "ok" }) => {
  if (status === "ok") return null;
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
        status === "cycle" ? "bg-red-500" : "bg-amber-500"
      }`}
    />
  );
};

export const SequenceSidebar = ({ sequences, violations, cycles, activeSequenceId }: Props) => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate();

  const sorted = [...sequences].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const handleSelect = (uuid: string) => {
    void navigate({
      to: "/projects/$projectId/overview",
      params: { projectId },
      search: { sequence: uuid },
    });
  };

  return (
    <aside className="flex flex-col w-52 shrink-0 border-r border-border overflow-y-auto">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
        Sequences
      </div>
      <ul className="flex flex-col py-1">
        {sorted.map((seq) => {
          const status = sequenceStatus(seq, violations, cycles);
          const count = fragmentCount(seq);
          const isActive = (activeSequenceId ?? null) === seq.uuid || (!activeSequenceId && seq.isMain);

          return (
            <li key={seq.uuid}>
              <button
                type="button"
                onClick={() => handleSelect(seq.uuid)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors ${
                  isActive ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                <StatusDot status={status} />
                <span className="flex-1 truncate">{seq.name}</span>
                {seq.isMain && (
                  <span className="text-xs px-1 rounded border border-border text-muted-foreground shrink-0">
                    Main
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
};
