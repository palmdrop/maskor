import type { Fragment } from "../../api/generated/maskorAPI.schemas";

type Props = {
  fragment: Fragment;
};

const FragmentProperty = ({ name, value }: { name: string; value: string }) => {
  return (
    <div>
      <span>{name}: </span>
      <span>{value}</span>
    </div>
  );
};

export const FragmentMetadata = ({ fragment }: Props) => {
  return (
    <div>
      <h3>Metadata</h3>
      <FragmentProperty name="Title" value={fragment.title} />
      <FragmentProperty name="Pool" value={fragment.pool} />
    </div>
  );
};
