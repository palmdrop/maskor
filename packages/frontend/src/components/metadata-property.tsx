import { cn } from "@/lib/utils";

type MetadataPropertyProps = {
  label: string;
  value: React.ReactNode;
  className?: string;
};

export const MetadataProperty = ({ label, value, className }: MetadataPropertyProps) => {
  return (
    <div className={cn("flex gap-2 pb-0.5", className)}>
      <dt className="text-xs text-muted-foreground w-20 uppercase font-serif">{label}</dt>
      <dd className="text-xs text-foreground">{value}</dd>
    </div>
  );
};

type MetadataListProps = {
  children: React.ReactNode;
  className?: string;
};

export const MetadataList = ({ children, className }: MetadataListProps) => {
  return <dl className={cn("flex flex-col gap-1", className)}>{children}</dl>;
};
