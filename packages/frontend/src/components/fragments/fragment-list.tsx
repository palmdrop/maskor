import type { IndexedFragment } from "../../api/generated/maskorAPI.schemas";
import { Button } from "../ui/button";

type Props = {
  fragments: IndexedFragment[];
  selectedId: string | null | undefined;
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
          <Button onClick={() => onSelect(fragment.uuid)}>
            {fragment.title} [{fragment.pool}] ({fragment.readyStatus})
          </Button>
        </li>
      ))}
    </ul>
  );
}
