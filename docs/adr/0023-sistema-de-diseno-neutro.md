# ADR-0023: Sistema de diseño neutro, con color solo para dinero, atención y error

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default (confirmado por el dueño del producto el 2026-11-08: sin color de marca)

## Contexto

El producto promete minimalismo ([01 · Visión](../01-vision.md)) y se vende por el precio: el descuento es lo que el usuario tiene que ver primero. Antes de construir las pantallas hacía falta fijar cómo se ven los precios, qué significa cada color, cómo funciona el modo oscuro y qué componentes se reutilizan. Sin eso, cada pantalla toma sus propias decisiones y el catálogo, el dashboard y la landing terminan pareciendo tres productos distintos.

## Decisión

- **Base neutra de shadcn** (`neutral`), sin color de marca. `primary` es casi negro en claro y casi blanco en oscuro.
- **Tres colores con un solo significado cada uno:**
  - `success`: dinero a favor del usuario (descuento, ahorro, recarga acreditada).
  - `warning`: atención cuando todo sigue funcionando (saldo bajo, modelo `deprecated`).
  - `destructive`: algo ya falla o no se puede deshacer.
- **Todo par de color pasa WCAG AA (4.5:1)** en los dos temas, también en hover, y una prueba lo recalcula desde `globals.css`. Por eso `destructive` no es el default de shadcn en ningún tema (valores y la única excepción medida en [13 · Sistema de diseño › Contraste medido](../13-sistema-de-diseno.md#contraste-medido)).
- **Modo oscuro desde el inicio**, con la clase `.dark` en `<html>`, `system` como default y un script inline en `<head>` para evitar el flash, según la guía de Next 16.
- **Una capa de componentes de producto** en `src/components/`: precio, descuento, tags, snippet, cifras y encabezados. Las pantallas se arman con esos componentes, no con clases sueltas.
- **Formatos centralizados** en `@/lib/format`, siempre con `Intl` y el idioma de la ruta.
- **`/design-system` es la referencia viva** y [13 · Sistema de diseño](../13-sistema-de-diseno.md) tiene las reglas.

## Consecuencias

- El verde del descuento resalta porque es casi el único color de la interfaz.
- Las pantallas nuevas se arman más rápido y se ven igual entre sí.
- La identidad visual sale de la tipografía y del espacio, no de un color. Si después se quiere un color de marca, se agrega como token `brand` con un uso acotado (logo, landing) y sin tocar `success`.
- Cada token nuevo obliga a medir su contraste en los dos temas.
- `Badge` y `Alert` tienen variantes propias (`success`, `warning`) que hay que volver a aplicar si se reinstalan con `shadcn add --overwrite`.

## Alternativas descartadas

- **Un color de marca como `primary`:** competiría con el verde del descuento por la atención, y pintaría de color botones que no significan nada especial.
- **El precio cheaptokens.wtf en verde:** el verde dejaría de distinguir el descuento, porque aparecería en cada celda de precio.
- **Un color por tag:** serían ocho tonos sin significado, y algunos chocarían con `success` o `warning`. Se usa un ícono por tag.
- **`next-themes`:** inserta un `<script>` desde un client component, cosa que React 19 advierte, y es una dependencia más para algo que la guía de Next resuelve en unas 20 líneas.
- **Solo `prefers-color-scheme`, sin selector:** el usuario no podría elegir un tema distinto al de su sistema.
