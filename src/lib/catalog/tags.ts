/**
 * Lista fija de tags del catálogo (ADR-0011). Agregar uno requiere cambiar esta
 * lista, su ícono en `@/components/model-tag` y los diccionarios de idioma.
 * Criterios en docs/06-catalogo-y-precios.md › Tags.
 */
export const MODEL_TAGS = [
  "fast",
  "reasoning",
  "coding",
  "vision",
  "tools",
  "open-weights",
  "long-context",
  "cheap",
] as const;

export type ModelTag = (typeof MODEL_TAGS)[number];
