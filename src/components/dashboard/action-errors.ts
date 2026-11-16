import type { ActionError } from "@/app/[lang]/(site)/dashboard/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Texto de cada error de las server actions del dashboard. */
export function actionErrors(dict: Dictionary): Record<ActionError, string> {
  const { dashboard } = dict;
  return {
    error: dashboard.error,
    paymentsUnavailable: dashboard.payments.unavailable,
    nameRequired: dashboard.keys.nameRequired,
    limitInvalid: dashboard.keys.limitInvalid,
    pickOne: dashboard.keys.pickOne,
    tooMany: dashboard.keys.tooMany,
    amountInvalid: dashboard.credits.amountInvalid,
  };
}
