import { useGetFragment } from "../api/generated/fragments/fragments";

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
      <h2>{fragment.title}</h2>
      <p>Pool: {fragment.pool}</p>
      <pre>{fragment.content}</pre>
    </div>
  );
}
