import type { IndexedFragment } from "../api/generated/maskorAPI.schemas";

type Props = {
  fragments: IndexedFragment[];
  selectedId: string | null;
  onSelect: (uuid: string) => void;
};

export function FragmentList({ fragments, selectedId, onSelect }: Props) {
  return (
    <ul>
      {fragments.map((fragment) => (
        <li
          key={fragment.uuid}
          style={{ fontWeight: selectedId === fragment.uuid ? "bold" : "normal" }}
        >
          <button onClick={() => onSelect(fragment.uuid)}>
            {fragment.title} [{fragment.pool}] ({fragment.readyStatus})
          </button>
        </li>
      ))}
    </ul>
  );
}
