import type { CatalogEntry } from "./types";

/**
 * La descripción que arma la importación cuando el proveedor no da una: el nombre y qué entradas acepta.
 * Vive aquí para que el catálogo la rehaga cuando la curaduría corrige `vision` (ADR-0069).
 */
export function generatedDescription(name: string, vision: boolean): CatalogEntry["description"] {
  return {
    en: `${name}. ${vision ? "Accepts text and image input." : "Accepts text input."}`,
    es: `${name}. ${vision ? "Admite entradas de texto e imagen." : "Admite entradas de texto."}`,
  };
}

/** Si la descripción es la generada (con o sin imagen), y no una escrita a mano. */
export function isGeneratedDescription(entry: Pick<CatalogEntry, "name" | "description">) {
  return [true, false].some((vision) => generatedDescription(entry.name, vision).en === entry.description.en);
}
