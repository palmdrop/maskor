import type { Fragment } from "../../api/generated/maskorAPI.schemas";
import { MetadataList, MetadataProperty } from "../metadata-property";

type Props = {
  fragment: Fragment;
};

export const FragmentMetadata = ({ fragment }: Props) => {
  return (
    <MetadataList>
      <MetadataProperty label="Title" value={fragment.title} />
      <MetadataProperty label="Notes" value={fragment.notes} />
      <MetadataProperty label="Status" value={fragment.readyStatus} />
      <MetadataProperty label="Updated at" value={new Date(fragment.updatedAt).toDateString()} />
      <MetadataProperty
        label="Aspects"
        value={
          <MetadataList>
            {Object.entries(fragment.properties).map(([aspectKey, { weight }]) => (
              <MetadataProperty key={aspectKey} label={aspectKey} value={weight} />
            ))}
          </MetadataList>
        }
      />
    </MetadataList>
  );
};
