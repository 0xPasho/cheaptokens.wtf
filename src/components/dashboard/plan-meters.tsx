import { UsageMeter } from "@/components/usage-meter";
import { activeWindow, type PlanUsage, windowFraction, windowUsed } from "@/lib/billing/limits";
import { formatDuration, formatPercent, formatUsd } from "@/lib/format";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";

/** Un límite se muestra exacto: sin decimales solo si es un monto entero (5,40 US$, no 5 US$). */
export function exactKind(micros: bigint): "whole" | "balance" {
  return micros % BigInt(1_000_000) === BigInt(0) ? "whole" : "balance";
}

/** La ventana de 5 horas y la semana del plan, con su reinicio y el valor usado. */
export function PlanMeters({ usage, now, locale, labels, extra }: {
  usage: PlanUsage;
  now: number;
  locale: string;
  labels: Dictionary["dashboard"]["limits"];
  /** Una línea más debajo de la ventana de 5 horas (p. ej. las requests típicas que quedan). */
  extra?: React.ReactNode;
}) {
  const meters = [
    { kind: "fiveHour", label: labels.fiveHour, window: usage.fiveHour, limit: usage.plan.fiveHourLimitMicroUsd },
    { kind: "week", label: labels.week, window: usage.week, limit: usage.plan.weekLimitMicroUsd },
  ] as const;
  return (
    <div className="flex flex-col gap-6">
      {meters.map(({ kind, label, window, limit }) => {
        const fraction = windowFraction(window, limit, now);
        const active = activeWindow(window, now);
        const details: React.ReactNode[] = [
          active ? t(labels.resetsIn, { duration: formatDuration(active.resetsAt - now, locale) }) : labels.startsOnNext,
          t(labels.value, { used: formatUsd(Number(windowUsed(window, now)), locale), limit: formatUsd(Number(limit), locale, exactKind(limit)) }),
        ];
        if (kind === "fiveHour" && extra) details.push(extra);
        return (
          <UsageMeter
            key={kind}
            locale={locale}
            label={label}
            fraction={fraction}
            status={fraction >= 1 ? labels.reached : t(labels.used, { percent: formatPercent(fraction, locale) })}
            details={details}
          />
        );
      })}
    </div>
  );
}
