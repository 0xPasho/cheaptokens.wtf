/** IDs públicos de la puerta de socios: prefijo y el UUID sin guiones, como `req_…` (docs/09). */

export type PublicIdPrefix = "plan" | "key";

export function toPublicId(prefix: PublicIdPrefix, uuid: string): string {
  return `${prefix}_${uuid.replaceAll("-", "")}`;
}

/** El UUID de un ID público, o null si no tiene la forma (la ruta responde 404, igual que si no existiera). */
export function fromPublicId(prefix: PublicIdPrefix, publicId: string): string | null {
  const hex = /^([a-z]+)_([0-9a-f]{32})$/.exec(publicId);
  if (!hex || hex[1] !== prefix) return null;
  const value = hex[2];
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
