# ADR-0025: Material liquid glass para la capa de controles y navegación

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Usuario (referencias visuales y pedido de liquid glass) + Default (niveles, opacidades y alternativas de accesibilidad)
- **Complementa** a [ADR-0023](./0023-sistema-de-diseno-neutro.md): no cambia los colores ni su significado; agrega un material.

## Contexto

El dueño del producto compartió 13 capturas de referencia: una interfaz oscura con paneles translúcidos y desenfoque, botones tipo píldora con brillo, segmentados de vidrio, modales con marco doble y popovers esmerilados. Pidió que el sistema de diseño se viera así, con "liquid glass".

El vidrio tiene un problema conocido: **su legibilidad depende de lo que tiene detrás**. La guía de Apple pide usarlo con moderación, solo en la capa de controles y navegación, y respetar *reduce transparency* e *increase contrast*. En la web, `prefers-reduced-transparency` solo existe en Chromium, y la refracción con SVG (`backdrop-filter: url()`) también.

## Decisión

- **Siete niveles de vidrio**, como utilidades de Tailwind en `globals.css` y hechos solo de tokens: `glass-surface`, `glass-bezel`, `glass-control`, `glass-prominent`, `glass-raised`, `glass-edge` y `glass-glow` ([13 · Sistema de diseño › Material](../13-sistema-de-diseno.md#material-liquid-glass)).
- **El vidrio es para controles y navegación**, como en Apple: botones, inputs, segmentados, menús, tooltips y el marco de los diálogos. El contenido (cards, tablas, avisos, código) va **opaco con borde luminoso** (`glass-edge`).
- **Opacidad calculada contra el peor fondo.** Cada superficie con texto es tan translúcida como permite que el texto pase AA con el color opuesto al tema detrás. Por eso en claro el vidrio es casi opaco (97%) y en oscuro llega al 90%. El marco de un diálogo no lleva texto y puede ser vidrio de verdad (10% en oscuro, 55% en claro).
- **Formas redondas y concéntricas:** los controles son píldoras, las cards usan `rounded-3xl` y el radio del panel de un diálogo es el del marco menos su margen.
- **Alternativas de accesibilidad en CSS:**
  - `prefers-reduced-transparency` y `prefers-contrast: more` vuelven opaco todo el vidrio y quitan el desenfoque.
  - Con `prefers-contrast: more` además se marcan los bordes.
  - Un navegador sin `backdrop-filter` recibe superficies opacas.
- **Sin refracción SVG:** solo funciona en Chromium y no aporta legibilidad.
- **Las referencias son de estilo, no de marca:** no se toma el amarillo ni ningún elemento de identidad de la app de la que salieron. Sigue sin haber color de marca ([ADR-0023](./0023-sistema-de-diseno-neutro.md)).

## Consecuencias

- La interfaz se parece a las referencias en material y forma, sin perder el contraste AA. `tests/unit/glass.test.ts` mide cada nivel contra el peor fondo y `tests/e2e/glass.spec.ts` lo comprueba en Chrome, también con transparencia reducida y con más contraste.
- En tema claro el vidrio se nota poco, porque casi es opaco. Es intencional: con texto gris, la legibilidad gana.
- Hay más cambios propios sobre los átomos de shadcn. Están listados en docs/13 y protegidos por pruebas.
- `backdrop-filter` cuesta GPU. Solo se usa en superficies flotantes (menús, tooltips, diálogos), no en controles repetidos.

## Alternativas descartadas

- **Vidrio en todo, también en el contenido:** contradice a Apple y vuelve ilegibles las tablas y los precios.
- **Opacidades bajas como en los mockups (6–10%) también con texto:** el texto secundario quedaba en 2.5:1 con un fondo claro detrás.
- **Refracción con SVG (`feDisplacementMap`):** solo Chromium, cara en GPU y sin beneficio de legibilidad.
- **`-apple-visual-effect`:** solo Safari en iOS 26.
- **Detectar el fondo con JavaScript para ajustar la opacidad:** complejo y frágil. Una opacidad fija calculada para el peor caso es predecible y se puede probar.
