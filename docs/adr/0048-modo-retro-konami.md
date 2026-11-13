# ADR-0048 · Modo retro con el código Konami

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Amplía:** el estilo NibbleRouter trasladado en ADR-0036 y la marca de cabecera de ADR-0047.

## Contexto

La marca «wtf» de la cabecera ya tiene un guiño retro (Comic Sans y arcoíris pastel, ADR-0047). El usuario pidió un paso más: que toda la web pueda volverse a ese estilo desordenado de la web de los 2000 a voluntad, mediante el código Konami (↑ ↑ ↓ ↓ ← → ← → B A Enter, con cierre en Enter porque no hay botón Start).

## Decisión

- `lib/retro.ts` lleva la lógica pura de la secuencia (`advanceKonami`), la clase `retro-party` de `<html>` y la preferencia en `localStorage` (clave `retro`), sincronizada entre pestañas.
- `KonamiRetro` escucha el teclado en toda la web, alterna el modo, muestra un aviso (`aria-live`) y restaura la preferencia tras hidratar; `retroScript` la aplica antes del primer paint para que recargar no dé un flash.
- El CSS vive en `globals.css`: Comic Sans en toda la web (sobrescribe `--font-inter`, el código queda en JetBrains Mono), fondo arcoíris pastel (tinta apagada en oscuro), bordes de caricatura con arcoíris en tarjetas, paneles y el CTA, títulos en caramelo saturado, inclinaciones leves «al azar» en las tarjetas del catálogo y selección rosa.
- Volviendo a meter el código se desactiva. El movimiento reducido apaga las animaciones por la regla global de `globals.css`; el disfraz queda estático.

## Consecuencias

- El modo rompe a propósito las reglas del sistema de diseño (colores fijos, no tokens). Es un disfraz: nada del modo retro debe copiarse a la web normal.
- Las capturas e2e no lo ven: cada prueba arranca con un contexto limpio y la preferencia no se filtra entre pruebas.
- La secuencia se ignora mientras se escribe en inputs, textareas o editores de contenido.

## Alternativas descartadas

- **Activarlo solo una vez, sin forma de apagarlo:** provocativo pero hostil; sin toggle el usuario queda atrapado en 2003.
- **`hue-rotate` animado sobre `html` o `body`:** convertiría toda la web en un stacking context y rompería la cabecera `fixed` y los diálogos con portal.
- **Un solo color pastel fijo:** pierde el efecto arcoíris que define la web vieja; el degradado en movimiento es el chiste.
