import { Badge } from "@/components/ui/badge";
import { formatDiscount } from "@/lib/format";
import { cn } from "@/lib/utils";

/** El descuento del modelo frente al precio oficial: `−90%`. Siempre en el tono `success`. */
export function DiscountBadge({
  discountBps,
  locale,
  className,
}: {
  discountBps: number;
  locale: string;
  className?: string;
}) {
  return (
    <Badge variant="success" className={cn("tabular-nums", className)}>
      {formatDiscount(discountBps, locale)}
    </Badge>
  );
}
