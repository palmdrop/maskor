import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const headingVariants = cva("font-sans font-medium", {
  variants: {
    level: {
      1: "text-2xl pb-2",
      2: "text-lg pb-1",
      3: "text-sm uppercase tracking-widest text-muted-foreground pb-0.5",
    },
  },
  defaultVariants: { level: 1 },
});

type Props = React.ComponentProps<"h1"> & VariantProps<typeof headingVariants>;

const TAG = { 1: "h1", 2: "h2", 3: "h3" } as const;

export function Heading({ level = 1, className, ...props }: Props) {
  const Tag = TAG[level!];
  return <Tag className={cn(headingVariants({ level }), className)} {...props} />;
}
