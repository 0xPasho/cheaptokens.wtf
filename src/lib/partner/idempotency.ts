/**
 * `Idempotency-Key` de la puerta de socios (docs/17): la misma key con el mismo body contesta lo mismo.
 *
 * Todo pasa en una transacción: la fila de la key se inserta primero, así que un reintento simultáneo espera
 * a que termine el primero y después lee su respuesta. Si la operación falla, la transacción se deshace y la
 * key queda libre. Solo se guardan las respuestas 2xx, cifradas, y se borran a las 24 horas.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { and, eq, lt } from "drizzle-orm";

import { partnerIdempotencyKeys } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

import { PartnerDoorError } from "./errors";

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export interface StoredAnswer {
  status: number;
  /** JSON ya serializado, o null en un 204. */
  body: string | null;
}

export function fingerprint(method: string, path: string, body: string): string {
  return createHash("sha256").update(`${method} ${path}\n${body}`, "utf8").digest("hex");
}

export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

/** Null si no se puede abrir (por ejemplo, porque el secreto del socio cambió). */
export function unseal(key: Buffer, sealed: string): string | null {
  try {
    const data = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export interface IdempotentCall {
  partnerId: string;
  key: string;
  fingerprint: string;
  sealKey: Buffer;
  now: number;
}

export async function withIdempotency(db: Db, call: IdempotentCall, run: (tx: Db) => Promise<StoredAnswer>): Promise<StoredAnswer> {
  await db.delete(partnerIdempotencyKeys).where(and(
    eq(partnerIdempotencyKeys.partnerId, call.partnerId),
    lt(partnerIdempotencyKeys.createdAt, new Date(call.now - IDEMPOTENCY_TTL_MS)),
  ));
  return db.transaction(async (tx) => {
    const claimed = await tx.insert(partnerIdempotencyKeys).values({
      partnerId: call.partnerId, key: call.key, fingerprint: call.fingerprint, status: 0, bodySealed: null, createdAt: new Date(call.now),
    }).onConflictDoNothing().returning({ key: partnerIdempotencyKeys.key });

    if (claimed.length === 0) {
      const [stored] = await tx.select().from(partnerIdempotencyKeys).where(and(
        eq(partnerIdempotencyKeys.partnerId, call.partnerId),
        eq(partnerIdempotencyKeys.key, call.key),
      ));
      if (!stored || stored.status === 0) throw new PartnerDoorError("conflict");
      if (stored.fingerprint !== call.fingerprint) throw new PartnerDoorError("idempotency_key_reused");
      if (stored.bodySealed === null) return { status: stored.status, body: null };
      const body = unseal(call.sealKey, stored.bodySealed);
      if (body === null) throw new PartnerDoorError("conflict");
      return { status: stored.status, body };
    }

    const answer = await run(tx);
    await tx.update(partnerIdempotencyKeys).set({
      status: answer.status,
      bodySealed: answer.body === null ? null : seal(call.sealKey, answer.body),
    }).where(and(eq(partnerIdempotencyKeys.partnerId, call.partnerId), eq(partnerIdempotencyKeys.key, call.key)));
    return answer;
  });
}
