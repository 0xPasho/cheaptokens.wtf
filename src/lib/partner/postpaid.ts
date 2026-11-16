/**
 * El excedente de un plan de socio es pospago (docs/17): lo paga el socio a fin de mes, no un saldo
 * prepagado. La admisión de ADR-0049 pide saldo positivo para usar créditos; a un plan de socio abierto se le
 * admite con lo que le queda del tope mensual. El cobro no cambia: `splitCharge` ya acota los créditos del
 * excedente con el tope, así que el saldo del workspace baja de cero y eso es lo que debe el socio.
 *
 * Solo consulta la base cuando el plan se agotó, el excedente con créditos está prendido, queda tope y el
 * saldo no alcanza. En cualquier otro caso devuelve el saldo tal cual.
 */
import { and, eq, isNull } from "drizzle-orm";

import { overflowCapLeft, planRemaining } from "@/lib/billing/limits";
import { partnerPlans } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import type { AuthContext } from "@/lib/gateway/types";

const ZERO = BigInt(0);

export async function admissionBalance(db: Db, context: AuthContext, now: number): Promise<bigint> {
  const { balanceMicroUsd, billingSource, plan, overflow } = context;
  if (balanceMicroUsd > ZERO || billingSource !== "plan_then_prepaid" || plan === null) return balanceMicroUsd;
  if (overflow.mode !== "continue" || !overflow.credits || planRemaining(plan, now) > ZERO) return balanceMicroUsd;
  const capLeft = overflowCapLeft(overflow);
  if (capLeft <= ZERO) return balanceMicroUsd;
  const [seat] = await db.select({ id: partnerPlans.id }).from(partnerPlans)
    .where(and(eq(partnerPlans.workspaceId, context.workspaceId), isNull(partnerPlans.closedAt)));
  return seat ? capLeft : balanceMicroUsd;
}
