/** API keys `wtf_` (docs/05-api-keys.md, ADR-0027). */
export interface GeneratedKey {
  /** En claro. Se muestra una sola vez y nunca se guarda ni se loguea. */
  key: string;
  /** SHA-256 hex de la key completa. */
  hash: string;
  /** `wtf_4f8K…b3Zx` */
  hint: string;
}

export type GenerateKey = () => GeneratedKey;

/** Prefijo, largo 53, alfabeto base62 y checksum CRC32. Sin red. */
export type ValidateKeyFormat = (candidate: string) => boolean;

export type HashKey = (key: string) => string;
