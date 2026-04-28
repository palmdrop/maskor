import type { IndexedFragment } from "../../api/generated/maskorAPI.schemas";
import { Button } from "../ui/button";

type Props = {
  fragments: IndexedFragment[];
  selectedId: string | null | undefined;
  onSelect: (uuid: string) => void;
};

export const FragmentList = ({ fragments, selectedId, onSelect }: Props) => {
  return (
    <ul>
      {fragments.map((fragment) => (
        <li
          key={fragment.uuid}
          style={{ fontWeight: selectedId === fragment.uuid ? "bold" : "normal" }}
          className={fragment.isDiscarded ? "opacity-50 line-through" : undefined}
        >
          <Button onClick={() => onSelect(fragment.uuid)}>
            {fragment.title}
            {fragment.isDiscarded && (
              <span className="ml-1 rounded bg-muted px-1 text-xs text-muted-foreground">
                Discarded
              </span>
            )}{" "}
            ({fragment.readyStatus})
          </Button>
        </li>
      ))}
    </ul>
  );
};
