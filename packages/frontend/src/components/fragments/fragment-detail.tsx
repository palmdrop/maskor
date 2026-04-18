import { useGetFragment } from "../../api/generated/fragments/fragments";
import { Heading } from "../heading";
import { Separator } from "../ui/separator";
import { FragmentMetadata } from "./fragment-metadata";

type Props = {
  projectId: string;
  fragmentId: string;
};

export function FragmentDetail({ projectId, fragmentId }: Props) {
  const { data: envelope, isLoading, isError } = useGetFragment(projectId, fragmentId);

  if (isLoading) {
    return <p>Loading fragment...</p>;
  }

  if (isError || !envelope) {
    return <p>Failed to load fragment.</p>;
  }

  const fragment = envelope.status === 200 ? envelope.data : null;

  if (!fragment) {
    return <p>Fragment unavailable.</p>;
  }

  return (
    <div>
      <Heading level={1}>{fragment.title}</Heading>
      <Separator />
      <FragmentMetadata fragment={fragment} />
      <Separator />
      <pre className="prose text-wrap">{fragment.content}</pre>
    </div>
  );
}
