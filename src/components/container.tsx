import { cn } from "@/lib/utils";

const WIDTHS = {
  /** Landing, catálogo y dashboard. */
  default: "max-w-[1440px] lg:px-10 xl:px-20",
  /** Texto largo en una sola columna. /docs usa el ancho normal con su índice (ADR-0068). */
  prose: "max-w-3xl",
} as const;

/** Ancho máximo y márgenes laterales de una página. Toda página empieza con uno. */
export function Container({
  size = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: keyof typeof WIDTHS }) {
  return (
    <div
      className={cn("mx-auto w-full px-4 sm:px-6", WIDTHS[size], className)}
      {...props}
    />
  );
}
