import InfoIcon from "kubai-icons-react/icons/info";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { t } from "@/lib/i18n/dictionaries";
import { btcDecimal } from "@/lib/payments/bitcoin/amounts";

/**
 * Un pago en Bitcoin visto en la red que todavía no se confirma (ADR-0065). Va arriba de Plan y Créditos: la
 * confirmación tarda de 10 a 60 minutos y para entonces el diálogo de pago suele estar cerrado.
 */
export function BitcoinPendingNotice({ pending, planName, labels }: {
  pending: { sats: string; planId: string | null }[];
  /** El nombre del plan que compra, si alguno de los pagos era de un plan. */
  planName: (planId: string) => string | null;
  labels: { pending: string; pendingPlan: string };
}) {
  if (pending.length === 0) return null;
  const plan = pending.map((payment) => (payment.planId ? planName(payment.planId) : null)).find(Boolean);
  const sats = pending.reduce((sum, payment) => sum + BigInt(payment.sats), BigInt(0));
  return (
    <Alert>
      <InfoIcon />
      <AlertDescription>{plan ? t(labels.pendingPlan, { plan }) : t(labels.pending, { amount: btcDecimal(sats) })}</AlertDescription>
    </Alert>
  );
}
