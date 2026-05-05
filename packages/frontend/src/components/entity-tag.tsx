import { Link, type LinkProps } from "@tanstack/react-router";

type Props = {
  linkArguments?: Pick<LinkProps, "params" | "search" | "to">;
  value: string;
  onRemove: () => void;
};

export const EntityTag = ({ linkArguments, value, onRemove }: Props) => {
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
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="ml-1 text-muted-foreground hover:text-foreground z-1"
      >
        ×
      </button>
    </span>
  );
};
