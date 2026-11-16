/**
 * Quién llama a la puerta de socios (docs/17): un socio, con `Authorization: Bearer <secreto>`. Cada socio
 * tiene su secreto en una variable de entorno. Sin la variable, o con menos de 32 caracteres, la puerta le
 * responde 401 a ese socio.
 */
import { createHash, hkdfSync, timingSafeEqual } from "node:crypto";

import { type EnvSource, readSecret } from "@/lib/env";

export const PARTNERS = [{ id: "deska", secretEnv: "PARTNER_DESKA_SECRET" }] as const;
export type PartnerId = (typeof PARTNERS)[number]["id"];

export const MIN_SECRET_LENGTH = 32;

function partnerSecret(secretEnv: string, env: EnvSource): string | null {
  const secret = readSecret(secretEnv, env);
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** El socio dueño del secreto, o null. Compara hashes de igual largo para no filtrar nada por tiempo. */
export function authenticatePartner(authorization: string | null, env: EnvSource): PartnerId | null {
  const received = createHash("sha256").update(authorization ?? "").digest();
  let match: PartnerId | null = null;
  for (const partner of PARTNERS) {
    const secret = partnerSecret(partner.secretEnv, env);
    const expected = createHash("sha256").update(`Bearer ${secret ?? ""}`).digest();
    if (timingSafeEqual(received, expected) && secret) match = partner.id;
  }
  return match;
}

/** Clave para cifrar las respuestas guardadas por `Idempotency-Key`, derivada del secreto del socio. */
export function idempotencySealKey(partnerId: PartnerId, env: EnvSource): Buffer {
  const partner = PARTNERS.find((candidate) => candidate.id === partnerId);
  const secret = partner ? partnerSecret(partner.secretEnv, env) : null;
  if (!secret) throw new Error("Partner secret is not configured");
  return Buffer.from(hkdfSync("sha256", secret, "", `cheaptokens.wtf partner idempotency v1 ${partnerId}`, 32));
}
