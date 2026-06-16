import { Link, type LinkProps } from "@tanstack/react-router";

type Props = {
  linkArguments?: Pick<LinkProps, "params" | "search" | "to">;
  value: string;
  onRemove: () => void;
  // When set, the remove (×) control is disabled and shows this text as its title (hover hint).
  // Used when an attachment is pinned by an inline `[[…]]` link in the body (document-links.md).
  removeDisabledReason?: string;
};

export const EntityTag = ({ linkArguments, value, onRemove, removeDisabledReason }: Props) => {
  const tagClass = "flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-sm z-0";

  return (
    <span className={tagClass}>
      {linkArguments ? (
        <Link {...linkArguments}>{value}</Link>
      ) : (
        <span className={tagClass}>{value}</span>
      )}
      <button
        type="button"
        disabled={removeDisabledReason !== undefined}
        title={removeDisabledReason}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="ml-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground z-1"
      >
        ×
      </button>
    </span>
  );
};
