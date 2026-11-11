import { cn } from "@/lib/utils";

/**
 * Una cifra destacada: saldo, gasto del mes, ahorro, requests.
 * `tone="success"` es solo para dinero a favor, como el ahorro (ver docs/13 › Color).
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  size = "default",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "success";
  /** `sm` para cifras que comparten una card angosta (p. ej. dos costos lado a lado). */
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          // Cifras grandes y ligeras (ref 12): el tamaño marca la jerarquía, no el peso.
          "font-heading font-light tracking-tight tabular-nums",
          size === "sm" ? "text-2xl" : "text-4xl",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
