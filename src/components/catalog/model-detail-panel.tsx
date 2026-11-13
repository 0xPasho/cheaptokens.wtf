import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The same opaque base and lighter front surface used by catalog cards. */
export function ModelDetailPanel({ children, footer, className, ...props }: ComponentPropsWithoutRef<"section"> & { footer?: ReactNode }) {
  return (
    <section className={cn("nr-detail-panel nr-layered-panel", className)} {...props}>
      <Card className="nr-layered-panel-front">{children}</Card>
      {footer ? <div className="nr-layered-panel-footer">{footer}</div> : null}
    </section>
  );
}
