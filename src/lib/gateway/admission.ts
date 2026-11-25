import { planUsageHeaders } from "@/lib/billing/headers";
import { budgetShortfall } from "@/lib/billing/limits";

import { admitUsage } from "./authenticate";
import { HOLD_MESSAGES } from "./errors";
import { type RequestShape, sizeHold } from "./request-cost";
import type { AuthContext, GatewayDeps, GatewayErrorCode, GatewayModel } from "./types";

/** La reserva del request (ADR-0066): se libera después de su cobro, o al fallar antes de agendarlo. */
export interface HoldState {
  release: () => void;
  /** True cuando ya hay una tarea en `after()` que cobra y después libera. */
  scheduled: boolean;
}

export type Reservation =
  | {
      ok: true;
      /** La salida que cabe: la pedida, o menos si el presupuesto no alcanza y el formato permite recortar. */
      maxOutputTokens: number;
      /** True si hay que mandarle `maxOutputTokens` al upstream. */
      limitsOutput: boolean;
      /** Lo que queda del plan antes de este request (ADR-0049). Sin plan, vacío. */
      usageHeaders: Record<string, string>;
    }
  | { ok: false; code: GatewayErrorCode; message?: string; retryAfterSeconds?: number };

/**
 * Admite el request y reserva lo máximo que puede costar (ADR-0066). Lo comparten `/v1/chat/completions` y
 * `/anthropic/v1/messages`: el dinero sigue un solo camino sin importar el formato.
 *
 * `fullOutput`: si el presupuesto no cubre la salida pedida entera, se rechaza en vez de recortarla. Es lo que
 * esperan los agentes (Claude Code): una respuesta cortada a mitad de una edición es peor que un error (ADR-0078).
 */
export async function reserveRequest(input: {
  deps: GatewayDeps;
  context: AuthContext;
  model: GatewayModel;
  shape: RequestShape;
  /** `deps.holds.mark()` tomado antes de autenticar: lo liberado después aún no está en lo que se leyó. */
  holdMark: number;
  hold: HoldState;
  fullOutput?: boolean;
}): Promise<Reservation> {
  const { deps, context, model, shape, holdMark, hold } = input;
  const wanted = sizeHold(model, shape, null);
  const wantedMicroUsd = wanted.ok ? wanted.amountMicroUsd : BigInt(0);
  const admissionNow = deps.now();
  const retryAfter = (retryAt: number | null) => retryAt === null ? undefined : (retryAt - admissionNow) / 1000;
  const heldNow = () => deps.holds.held(context.workspaceId, context.apiKeyId, holdMark);
  // El plan solo alcanza si cubre este request además de lo que ya reservan los que están en curso.
  let admission = await admitUsage(context, model.id, deps.db, admissionNow, wantedMicroUsd + heldNow().workspace);
  let held = heldNow();
  if (admission.ok && admission.planOnly && admission.budgetMicroUsd - held.workspace < wantedMicroUsd) {
    // Otro request reservó mientras se leía la base y el plan ya no alcanza solo: ahora sí cuentan los
    // paquetes y el excedente de socio.
    admission = await admitUsage(context, model.id, deps.db, admissionNow, null);
    held = heldNow();
  }
  if (!admission.ok) {
    return { ok: false, code: admission.code, retryAfterSeconds: retryAfter(admission.retryAt) };
  }
  // Solo se admite lo que cabe en lo que queda, descontado lo que reservan los requests en curso (ADR-0066).
  // Desde la última lectura de `held` hasta `hold()` no hay await: dos requests no pueden reservar el mismo saldo.
  const workspaceBudget = admission.budgetMicroUsd - held.workspace;
  const keyBudget = context.spendLimitMicroUsd === null ? null : context.spendLimitMicroUsd - context.spentMicroUsd - held.key;
  const keyBinds = keyBudget !== null && keyBudget < workspaceBudget;
  const size = sizeHold(model, shape, keyBinds ? keyBudget : workspaceBudget);
  const fits = size.ok && (!input.fullOutput || !wanted.ok || size.maxOutputTokens >= wanted.maxOutputTokens);
  if (!size.ok || !fits) {
    if (keyBinds) return { ok: false, code: "key_limit_exceeded", message: HOLD_MESSAGES.key_limit_exceeded };
    const shortfall = budgetShortfall(context.billingSource, context.plan, admissionNow);
    return {
      ok: false, code: shortfall.code, message: HOLD_MESSAGES[shortfall.code], retryAfterSeconds: retryAfter(shortfall.retryAt),
    };
  }
  hold.release = deps.holds.hold(context.workspaceId, context.apiKeyId, size.amountMicroUsd);
  return {
    ok: true,
    maxOutputTokens: size.maxOutputTokens,
    limitsOutput: size.limitsOutput,
    usageHeaders: context.billingSource === "prepaid_only" ? {} : planUsageHeaders(context.plan, admissionNow),
  };
}

/** Agenda el cobro en `after()` y libera la reserva cuando el cobro ya está en la base, aunque falle. */
export function chargeThenRelease(deps: GatewayDeps, hold: HoldState, task: () => Promise<void>): void {
  deps.after(async () => {
    try {
      await task();
    } finally {
      hold.release();
    }
  });
  // Solo cuando `after()` aceptó la tarea: si lanza, la reserva la libera quien atrapa el error.
  hold.scheduled = true;
}
