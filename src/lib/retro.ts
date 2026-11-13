export const RETRO_STORAGE_KEY = "retro";

/**
 * La secuencia Konami con cierre en Enter (aquí no hay botón Start):
 * ↑ ↑ ↓ ↓ ← → ← → B A Enter.
 */
export const KONAMI_KEYS = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a", "enter"] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

/**
 * Progreso puro de la secuencia: devuelve cuántas teclas van bien encadenadas
 * tras pulsar `key` habiendo acertado ya `progress`. Las teclas que cortan la
 * cadena pueden empezar una secuencia nueva (p. ej. el primer ↑ tras fallar).
 */
export function advanceKonami(key: string, progress: number): number {
  const pressed = normalizeKey(key);
  if (pressed === KONAMI_KEYS[progress]) return progress + 1;
  return pressed === KONAMI_KEYS[0] ? 1 : 0;
}

/** Solo en el cliente. */
export function readStoredRetro(): boolean {
  try {
    return localStorage.getItem(RETRO_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** Pone o quita la clase `.retro-party` de `<html>` y guarda la preferencia. Solo en el cliente. */
export function applyRetro(on: boolean) {
  document.documentElement.classList.toggle("retro-party", on);
  try {
    localStorage.setItem(RETRO_STORAGE_KEY, on ? "on" : "off");
  } catch {}
}

/** Corre antes del primer paint para que recargar no dé un flash del estilo normal. */
export const retroScript = `(function(){try{if(localStorage.getItem("${RETRO_STORAGE_KEY}")==="on")document.documentElement.classList.add("retro-party")}catch(e){}})()`;
