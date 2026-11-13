import { describe, expect, it } from "vitest";

import { advanceKonami, KONAMI_KEYS } from "@/lib/retro";

function press(keys: readonly string[]) {
  return keys.reduce((progress, key) => advanceKonami(key, progress), 0);
}

describe("advanceKonami", () => {
  it("completa la secuencia completa", () => {
    expect(press(KONAMI_KEYS)).toBe(KONAMI_KEYS.length);
  });

  it("acepta las letras en mayúsculas y minúsculas", () => {
    expect(press([...KONAMI_KEYS.slice(0, 8), "B", "A"])).toBe(KONAMI_KEYS.length - 1);
  });

  it("reinicia con una tecla que corta la cadena", () => {
    expect(press(["ArrowUp", "ArrowUp", "ArrowLeft"])).toBe(0);
  });

  it("una tecla que corta puede empezar una secuencia nueva", () => {
    expect(press(["ArrowUp", "ArrowUp", "ArrowUp"])).toBe(1);
  });

  it("no completa si falta la tecla final", () => {
    expect(press(KONAMI_KEYS.slice(0, -1))).toBe(KONAMI_KEYS.length - 1);
  });

  it("una segunda secuencia arranca de cero tras completar", () => {
    expect(press([...KONAMI_KEYS, "ArrowUp"])).toBe(1);
  });
});
