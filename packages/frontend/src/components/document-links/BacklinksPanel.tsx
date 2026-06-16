import { Link } from "@tanstack/react-router";
import { useListBacklinks } from "@api/generated/links/links";
import { entityKindToLinkPathType, type LinkTargetType } from "@maskor/shared";
import { linkRouteFor } from "@lib/document-links/resolver";

type Props = {
  projectId: string;
  targetType: LinkTargetType;
  targetKey: string;
};

// Lists every body that links to this entity, read from the persisted link table (no body re-scan).
// Each row navigates to the referring entity; a context snippet is shown when available.
export const BacklinksPanel = ({ projectId, targetType, targetKey }: Props) => {
  const { data: envelope } = useListBacklinks(projectId, { targetType, targetKey });
  const backlinks = envelope?.status === 200 ? envelope.data : [];

  if (backlinks.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Backlinks ({backlinks.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {backlinks.map((backlink) => (
          <li key={`${backlink.sourceType}/${backlink.sourceUuid}`} className="text-sm">
            <Link
              {...linkRouteFor(
                entityKindToLinkPathType(backlink.sourceType),
                backlink.sourceUuid,
                projectId,
              )}
              className="font-medium text-primary hover:underline"
            >
              {backlink.sourceKey}
            </Link>
            <span className="ml-1 text-xs text-muted-foreground">{backlink.sourceType}</span>
            {backlink.snippet && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{backlink.snippet}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
