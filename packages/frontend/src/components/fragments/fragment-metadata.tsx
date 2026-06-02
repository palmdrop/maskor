import type { Fragment } from "@api/generated/maskorAPI.schemas";
import { MetadataList, MetadataProperty } from "@components/metadata-property";

type Props = {
  fragment: Fragment;
};

export const FragmentMetadata = ({ fragment }: Props) => {
  return (
    <MetadataList>
      <MetadataProperty label="Status" value={fragment.readiness} />
      <MetadataProperty label="Updated at" value={new Date(fragment.updatedAt).toDateString()} />
      <MetadataProperty
        label="Aspects"
        value={
          <MetadataList>
            {Object.entries(fragment.aspects).map(([aspectKey, { weight }]) => (
              <MetadataProperty key={aspectKey} label={aspectKey} value={weight} />
            ))}
          </MetadataList>
        }
      />
    </MetadataList>
  );
};
