import { createHash, timingSafeEqual } from "node:crypto";

/**
 * `Authorization: Bearer <secreto>` contra cualquiera de los secretos dados. Los ausentes o de menos
 * de 16 caracteres no cuentan. Compara hashes: tienen igual longitud aunque el token recibido no.
 */
export function hasInternalSecret(request: Request, secrets: (string | null | undefined)[]): boolean {
  const received = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  let match = false;
  for (const secret of secrets) {
    if (!secret || secret.length < 16) continue;
    const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
    if (timingSafeEqual(received, expected)) match = true;
  }
  return match;
}
