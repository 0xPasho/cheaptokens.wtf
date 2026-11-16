import { Progress, ProgressLabel } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Un límite del plan que se va consumiendo (ventana de 5 horas o semana), sobre `Progress`.
 * Desde el 80 % la barra pasa a `warning`: todavía funciona, pero hay que prestar atención (docs/13 › Color).
 */
export function UsageMeter({
  label,
  fraction,
  status,
  details,
  className,
}: {
  label: React.ReactNode;
  /** De 0 a 1. */
  fraction: number;
  /** Lo que se lee a la derecha: `34 % usado` o `Límite alcanzado`. */
  status: React.ReactNode;
  /** Reinicio y valor usado, debajo de la barra. */
  details?: React.ReactNode[];
  className?: string;
}) {
  const value = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10;
  const warning = fraction >= 0.8;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Progress
        value={value}
        className={cn(warning && "[&_[data-slot=progress-indicator]]:bg-warning")}
      >
        <ProgressLabel>{label}</ProgressLabel>
        <span className={cn("ml-auto text-sm tabular-nums", warning ? "text-warning" : "text-muted-foreground")}>{status}</span>
      </Progress>
      {details?.length ? (
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {details.map((detail, index) => <span key={index}>{detail}</span>)}
        </div>
      ) : null}
    </div>
  );
}
