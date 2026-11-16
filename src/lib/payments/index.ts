/**
 * Proveedor de pagos (docs/08 › Merchant of Record, ADR-0019). La integración con el MoR espera su
 * aprobación por escrito; mientras tanto solo existe el proveedor de desarrollo, que confirma al instante
 * y solo existe en desarrollo local (`isLocalDevelopment`).
 */
import { randomUUID } from "node:crypto";

import { isLocalDevelopment } from "@/lib/auth/mode";
import type { PaymentRef } from "@/lib/billing/purchases";

export type CheckoutItem =
  | { kind: "topup"; amountMicroUsd: bigint }
  | { kind: "subscription"; planId: string; amountMicroUsd: bigint }
  | { kind: "pack"; modelId: string; amountMicroUsd: bigint };

export interface PaymentProvider {
  id: string;
  /** Cobra y devuelve el pago confirmado. Un MoR real redirige a su checkout y confirma por webhook. */
  charge(workspaceId: string, item: CheckoutItem): Promise<PaymentRef>;
}

const devProvider: PaymentProvider = {
  id: "dev",
  async charge() {
    return { provider: "dev", externalId: `dev_${randomUUID()}`, receiptUrl: null };
  },
};

/** Null mientras no haya MoR: el dashboard muestra los pagos como no disponibles. */
export function getPaymentProvider(): PaymentProvider | null {
  return isLocalDevelopment() ? devProvider : null;
}
