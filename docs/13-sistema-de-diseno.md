# 13 · Sistema de diseño

El estándar visual de cheaptokens.wtf: qué se usa, cuándo y por qué. La **referencia viva** es la página [`/design-system`](http://localhost:3000/design-system), que muestra cada token, componente y patrón renderizado en los dos temas. Este documento tiene las reglas. La decisión de fondo está en [ADR-0023](./adr/0023-sistema-de-diseno-neutro.md).

## Principios

1. **Neutro por defecto.** La interfaz es blanco, negro y grises. El color aparece solo cuando significa algo, y cada color significa **una sola cosa**.
2. **El precio es el protagonista.** El producto se vende por el descuento ([01 · Visión](./01-vision.md)), así que los precios se ven igual en todas partes: tabulares, alineados a la derecha y con el precio oficial siempre visible.
3. **Una acción principal por vista.** Solo un botón con la variante `default` (relleno) por pantalla o diálogo.
4. **Componentes antes que clases sueltas.** Si un patrón ya existe en `@/components`, se usa. Repetir el mismo `className` en tres pantallas es la señal de que falta un componente.

## Color

Todos los colores son tokens semánticos definidos en `src/app/globals.css` para `:root` (claro) y `.dark` (oscuro). **Nunca** se usan colores crudos de Tailwind (`zinc-500`) ni valores (`#fff`) en un componente.

| Token | Para qué | No usar para |
|---|---|---|
| `background`, `foreground` | Fondo de página y texto principal | |
| `card`, `popover` | Superficies elevadas: cards, menús, diálogos | |
| `muted` | Fondos sutiles, bloques de código | Texto |
| `muted-foreground` | Texto secundario, descripciones, **precio oficial tachado** | Texto que hay que leer para actuar |
| `border`, `input`, `ring` | Bordes, bordes de controles, anillo de foco | Texto |
| `overlay` | Fondo detrás de diálogos (10% negro en claro, 40% en oscuro) | Superficies |
| `primary` | La acción principal de la vista | Decoración, links dentro de texto |
| `secondary`, `accent` | Acciones secundarias, hover de menús | |
| `success` | **Dinero a favor del usuario:** badge de descuento, cifra de ahorro, recarga acreditada | Precio cheaptokens.wtf, "copiado", estados como "activa" |
| `warning` | **Atención, todavía funciona:** saldo bajo, modelo `deprecated` | Errores |
| `destructive` | **Ya falla o no se deshace:** saldo en cero, errores, revocar una key | Avisos preventivos |
| `chart-1` … `chart-5` | Reservados para las gráficas de uso (fase 2). Hoy son grises | |

- **No hay color de marca.** `primary` es casi negro en claro y casi blanco en oscuro. Si mañana se quiere un color de marca, se agrega como token `brand` con su propio uso; no reemplaza a `success` ni se usa en precios ([ADR-0023](./adr/0023-sistema-de-diseno-neutro.md)).
- **El precio cheaptokens.wtf no va en verde.** Va en `foreground` con peso `medium`. El verde se reserva para el descuento, así el ojo lo encuentra.
- **Los tags no llevan color.** Son badges `outline` con un ícono por tag. Ocho colores para ocho tags serían ruido y chocarían con el significado de `success` y `warning`.
- **Si falta un rol, se agrega un token**, no se toma prestado otro porque "se ve bien". Un token nuevo se define en `:root` y `.dark`, se mapea en `@theme inline` y se mide su contraste en los dos temas.

### Contraste medido

Los tokens nuevos se midieron contra los fondos donde realmente se pintan (WCAG 2 / APCA Lc):

| Par | Claro | Oscuro |
|---|---|---|
| `success` sobre `background` | 5.41:1 · Lc 76 | 10.85:1 · Lc −69 |
| `success` sobre su tinte de badge (`/10` claro, `/20` oscuro) | 4.70:1 · Lc 67 | 6.41:1 · Lc −61 |
| `warning` sobre `background` | 5.47:1 · Lc 77 | 11.51:1 · Lc −72 |
| `warning` sobre su tinte de badge | 4.77:1 · Lc 68 | 6.67:1 · Lc −64 |
| `muted-foreground` sobre `background` | 5.06:1 | 7.63:1 |
| `muted-foreground` sobre `muted` (Avatar, Kbd) | 4.64:1 | 5.83:1 |
| `destructive` sobre `background` | 6.68:1 | 8.01:1 |
| `destructive` sobre su tinte en reposo (`/10` claro, `/20` oscuro) | 5.54:1 | 5.96:1 |
| `destructive` sobre su tinte en hover (`/20` claro, `/30` oscuro) | 4.55:1 | 4.78:1 |
| Tintes de color en reposo sobre `card` y sobre el pie de una card | ≥ 4.7:1 | ≥ 4.73:1 |
| `*-foreground` sobre el color sólido | ≥ 5.2:1 | ≥ 9.8:1 |

Todos pasan WCAG AA (4.5:1) para texto chico. **`tests/unit/tokens.test.ts` recalcula estos pares desde `globals.css`**: si un token cambia y un par baja de AA, la prueba falla.

- **`destructive` y `muted-foreground` no son los de shadcn.** Los defaults no pasaban AA en `Badge`, `Button`, `Avatar` y `Kbd`, y el rojo quedaba fuera de sRGB. Se ajustó solo la lightness, en el mismo tono:
  - `destructive`: `oklch(0.5 0.204 27.325)` en claro y `oklch(0.74 0.158 22.216)` en oscuro.
  - `muted-foreground` en claro: `oklch(0.54 0 0)` (antes 0.556, que medía 4.34:1 sobre `muted`).

  Si se reinstala el CSS de shadcn, hay que conservar estos valores. Los encontró axe en `tests/e2e/`.
- **Excepción conocida:** el **hover** de un botón destructive **sobre una card** baja de 4.5. Mide 4.37:1 en el pie de una card en claro, y 4.17:1 sobre la card y 3.85:1 en su pie en oscuro. En reposo pasa en todas las superficies; subir el hover a 4.5 deslava el rojo. Si se puede, los botones destructive van sobre el fondo de la página.

## Material: liquid glass

Decisión en [ADR-0025](./adr/0025-material-liquid-glass.md). La sección `/design-system › Material` muestra cada nivel sobre textura y sobre el peor fondo.

### De dónde salen las reglas

- **Referencias del producto:** 13 capturas de una app oscura con paneles de vidrio. Se toma el material y la forma, no la marca.
- **[Apple · Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass):**
  - El vidrio es la capa de controles y navegación, no el contenido.
  - Se usa con moderación, sin apilar vidrio sobre vidrio, con formas redondas y concéntricas.
  - Hay que probar con *reduce transparency*, *increase contrast* y *reduce motion*.
- **[Chrome · prefers-reduced-transparency](https://developer.chrome.com/blog/css-prefers-reduced-transparency):** la estrategia es aditiva. Con la preferencia activa, la superficie sube a casi opaca. Solo Chromium 118+ la soporta.
- **[Liquid glass en la web (6 técnicas)](https://dev.to/devyatov/liquid-glass-on-the-web-6-ways-to-build-it-with-css-and-svg-3m07):**
  - La técnica estable es relleno translúcido, borde de 1 px, `blur() saturate()` con prefijo `-webkit-` y sombra.
  - La refracción con SVG es solo de Chromium.
  - Hay que probar el peor caso, no el mockup.

### Reglas

1. **Vidrio en controles y navegación; contenido opaco.** Botones, inputs, segmentados, menús, tooltips y el marco de los diálogos van en vidrio. Cards, tablas, avisos y código van opacos con borde luminoso (`glass-edge`).
2. **Nada de vidrio sobre vidrio.** Dentro de un `InputGroup` el vidrio lo pone el grupo, no el input (`not-data-[slot=input-group-control]:glass-control`).
3. **`glass-control` solo sobre superficies propias:** el fondo, una card o un `glass-surface`. Nunca directo sobre una foto o contenido de terceros; ahí va `glass-surface`.
4. **Formas concéntricas:**
   - Controles: `rounded-full`.
   - Cards: `rounded-3xl`.
   - Popovers: `rounded-2xl`.
   - El panel de un diálogo usa el radio del marco menos su margen (`2rem − 0.625rem = 1.375rem`).
5. **Solo tokens.** Las utilidades están hechas de variables de `globals.css`. Ningún componente escribe `backdrop-blur` con colores propios.

### Niveles

| Utilidad | Para qué | Referencia |
|---|---|---|
| `glass-surface` | Popovers, menús, selects, tooltips | Ref 9 (dropdown "Style kit") |
| `glass-bezel` | Marco de diálogos. **No lleva texto**, así que es el más transparente | Refs 5, 10, 11 |
| `glass-control` | Botón `outline`, inputs, pista de segmentados, tags, `Kbd` | Refs 1, 2, 10 |
| `glass-prominent` | La acción principal (`Button` default): píldora con degradado y brillo | Refs 3 ("Connect MCP"), 10 ("Continue with Google") |
| `glass-raised` | Opción activa de un segmentado o toggle presionado | Refs 3, 4, 6, 7 |
| `glass-track` | Pista hundida de `Switch`, `Slider` y `Progress` | Refs 1, 6 ("Unlimited") |
| `glass-knob` | Perilla de `Switch` y `Slider`: sombra y brillo; el color lo pone el componente | Apple: la perilla se vuelve vidrio |
| `glass-edge` | Contenido opaco con borde luminoso: `Card`, `Alert`, `CodeBlock` | Refs 7, 12 |
| `glass-glow` | Resplandor de un estado vacío; el fondo de la página tiene uno arriba | Refs 1, 2, 3 |

### Opacidad y contraste medido

Cada superficie con texto se mide con **el color opuesto al tema detrás** (blanco puro en oscuro, negro puro en claro). El desenfoque promedia el fondo, así que un fondo liso es el peor caso.

| Nivel | Claro | Oscuro | Peor par medido |
|---|---|---|---|
| `glass-surface` | blanco 97% | `oklch(0.18)` 90% | Texto secundario: 4.5:1 claro, 5.6:1 oscuro |
| `glass-bezel` | blanco 55% | blanco 10% | Sin texto encima |
| `glass-control` | negro 2% | blanco 6% | Placeholder sobre vidrio con el peor fondo: 4.54:1 claro, 4.65:1 oscuro |
| `glass-prominent` | 0.34 → 0.18 | 1 → 0.88 | Texto: ≥ 11.3:1 |
| `glass-raised` | blanco | blanco 16% → 6% | Texto: ≥ 4.5:1 |

- **En claro el vidrio es casi opaco.** Con texto gris y un fondo oscuro detrás, la legibilidad gana; Apple hace lo mismo ("si el vidrio no se lee, se quita vidrio").
- **Las pestañas inactivas usan `foreground/70`, no `muted-foreground`.** Sobre una pista de vidrio con el peor fondo, el gris medía 4.01:1; lo encontró axe.

### Alternativas de accesibilidad

| Situación | Qué pasa |
|---|---|
| `prefers-reduced-transparency: reduce` | `glass-surface` → `popover` y `glass-bezel` → `muted`, opacos y sin desenfoque. Sin resplandor ambiental |
| `prefers-contrast: more` | Lo mismo, más bordes al 55% y sin brillos |
| Sin soporte de `backdrop-filter` | Superficies opacas |
| `prefers-reduced-motion` | Ninguna transición ni animación dura más de 0.01 ms (regla global en `globals.css`, probada en Chrome). La perilla del slider no crece al arrastrar |

### Componente por componente

La revisión de cada componente contra su referencia, y la prueba que lo cuida:

| Componente | Referencia | Qué se tomó | Prueba |
|---|---|---|---|
| `Button` default | Refs 3, 10 | Píldora clara con degradado y brillo en oscuro, oscura en claro | `glass-atoms`, captura `button` |
| `Button` outline / secondary | Refs 2, 5 ("Open Project", "Cancel") | Píldora de vidrio con borde | `glass-atoms`, axe sobre vidrio |
| `Badge` outline / tags | Refs 2, 5 ("Example project", "By Artist") | Etiqueta de vidrio | `catalog`, `glass-atoms` |
| `Badge` success | Ref 7 ("Most Popular", "Save 40%") | Ya era tinte verde: el verde de dinero a favor coincide | `price` |
| `Card` | Refs 7, 12 | Esquinas grandes, borde luminoso arriba, contenido opaco | `glass-atoms`, captura `card` |
| `Dialog`, `AlertDialog` | Refs 5, 10, 11 | Marco doble: bisel de vidrio translúcido y panel opaco, radios concéntricos | `glass-atoms`, `glass.spec` (marco con blur, panel opaco, opaco con transparencia reducida) |
| `DropdownMenu`, `Select` | Ref 9 | Popover esmerilado con brillo | `glass-atoms`, `glass.spec` (menú abierto, axe) |
| `Tooltip` | Ref 9 | Vidrio en vez de bloque invertido | `glass-atoms` |
| `Tabs` (`QuickstartSnippet`) | Refs 3, 4 ("Framing / Directing") | Pista de vidrio y opción activa elevada | `glass-atoms`, captura `snippet` |
| `ToggleGroup` (recarga, filtros) | Refs 6, 7 ("standard / pro / 4k", "Monthly / Yearly") | Un segmentado con pista; los filtros de tag, píldoras sueltas | `glass-atoms`, captura `recarga` |
| `Input`, `InputGroup`, `NativeSelect`, `Select` | Ref 10 | Píldoras de vidrio; `Textarea` con `rounded-2xl` | `glass-atoms`, axe sobre vidrio |
| `Alert` | Ref 12 | Borde luminoso; el color va en el texto | `glass-atoms`, captura `avisos` |
| `Empty` | Ref 2 ("Create Your First Project") | Resplandor centrado | `glass-atoms`, captura `estado-vacio` |
| `Stat` | Ref 12 ("10x", "10,000") | Cifras grandes de peso ligero (`text-4xl font-light`) | `layout`, captura `cifras` |
| `PriceComparison`, `DiscountBadge` | Ref 7 | Precio oficial tachado y precio grande. Ya coincidía | `price` |
| `CodeBlock` | Refs 3, 4 | Panel opaco con borde luminoso | `glass-atoms`, captura `snippet` |
| `Kbd` | Ref 1 | Tecla de vidrio | `glass-atoms` |
| `Switch` | Refs 1, 6 ("Unlimited") | Pista hundida apagado, píldora prominente encendido, perilla de vidrio. Perilla gris apagado en claro: 4.0:1 contra la pista | `glass-atoms`, `glass` (3:1 de indicadores), foco en Chrome |
| `Checkbox`, `RadioGroup` | Ref 6 | Vidrio con borde `muted-foreground/80` (3.4:1 claro, 5.2:1 oscuro; el de shadcn medía ~1.2:1), prominente al marcar | `glass-atoms`, `glass`, foco en Chrome |
| `Slider` | Ref 6 + Apple | Pista hundida, relleno, perilla de vidrio que crece al arrastrar. **El anillo de foco no se veía con teclado** (el foco cae en un `<input>` adentro): ahora usa `has-[:focus-visible]` | `glass-atoms`, foco en Chrome |
| `Progress` | Ref 6 | Pista hundida y relleno redondo | `glass-atoms`, `glass` |
| Fondo de la página | Refs 1, 3 | Resplandor ambiental arriba | `glass` (contraste con el resplandor) |

**Sin vidrio a propósito:**
- `Table`, `Avatar` y `AspectRatio` son contenido, y el contenido va opaco.
- `Label`, `Field`, `Separator`, `Spinner` y `Skeleton` no son controles ni superficies.

**Lo que no se tomó de las referencias:**

- El amarillo y el logo: son la marca de otra app.
- Las imágenes de fondo: cheaptokens.wtf no tiene fotos.
- La sidebar de navegación: llega con el dashboard ([02 · Producto y UX](./02-producto-y-ux.md)).

## Tema claro y oscuro

- **Mecanismo único:** la clase `.dark` en `<html>`. Las variantes `dark:` de Tailwind dependen de ella.
- **Default: `system`** (sigue al sistema operativo). La preferencia se guarda en `localStorage` con la clave `theme`.
- **Sin flash:** `themeScript` (en `src/lib/theme.ts`) corre en el `<head>` del layout raíz antes del primer paint, como indica la guía `preventing-flash-before-hydration` de Next 16. `<html>` lleva `suppressHydrationWarning` por eso.
- **Después de hidratar:** `<ThemeSync />` (en el layout) sigue los cambios del sistema operativo y de otras pestañas. `useTheme()` (en `src/hooks/use-theme.ts`) lee y cambia la preferencia, y `<ThemeToggle />` es el selector.
- **Por qué no `next-themes`:** inserta un `<script>` desde un client component y React 19 lo advierte en desarrollo. La guía oficial de Next resuelve lo mismo con un script inline y sin dependencia.
- Al cambiar de tema se apagan las transiciones un frame, para que los colores no se animen uno por uno.

## Tipografía

Geist para todo y Geist Mono para código. Hay pocos tamaños, y la jerarquía sale del peso y del color más que del tamaño.

| Rol | Clases | Dónde |
|---|---|---|
| Display | `font-heading text-4xl sm:text-5xl font-semibold tracking-tight text-balance` | Solo el hero de la landing |
| Título de página (`h1`) | `<PageHeader>` | Uno por página |
| Título de sección (`h2`) | `<SectionHeader>` | Bloques dentro de una página |
| Título de card | `<CardTitle>` | |
| Cuerpo | `text-sm` en el dashboard y las tablas, `text-base` en la landing y /docs | |
| Secundario | `text-sm text-muted-foreground` | Descripciones y ayudas |
| Etiqueta | `text-xs font-medium text-muted-foreground` | Encima de una cifra |
| Código e IDs | `font-mono text-xs`, o `text-sm` en bloques | IDs de modelo, keys, snippets |
| Cifra destacada | `<Stat>`: `text-4xl font-light tracking-tight` | Saldo, gasto, ahorro (ref 12) |
| Cifras | `tabular-nums` | **Todo** monto, conteo o fecha que se compare en columna |
| Wordmark | `font-heading font-semibold tracking-tight` (`text-base` en el header) | Header y footer. El texto sale de `dict.meta.siteName` |

- **La marca es el nombre completo:** `cheaptokens.wtf`, siempre en minúsculas y con el `.wtf`, también al empezar una oración. Nunca "CheapTokens", "Cheap Tokens" ni "cheaptokens" sin el TLD. El wordmark es ese texto y no hay logo gráfico ([ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)).
- Los títulos llevan `text-balance` y los párrafos `text-pretty`.
- No se inventan tamaños fuera de esta tabla. Si hace falta uno, se agrega aquí primero.

## Layout y espaciado

- **Ancho:** toda página empieza con `<Container>`. Usa `default` (`max-w-5xl`) para la landing, el catálogo y el dashboard, y `prose` (`max-w-3xl`) para /docs y el texto legal. El margen lateral es `px-4 sm:px-6`.
- **Ritmo vertical:** `py-12 sm:py-16` en la página, `gap-10` entre secciones, `gap-4` dentro de una sección y `gap-2` entre una etiqueta y su control (eso ya lo hace `Field`).
- **Radios:** salen de `--radius` (`0.75rem`). Los controles son píldoras (`rounded-full`), los popovers usan `rounded-2xl`, y las cards y el marco de un diálogo `rounded-3xl` o más, siempre concéntricos ([Material](#material-liquid-glass)).
- **Tablas:** el texto va alineado a la izquierda y los números a la derecha. En el catálogo, los tags van debajo del nombre del modelo y no en una columna propia, para que la tabla quepa en pantallas medianas.
- **Íconos:** lucide, a `size-4` (los botones ya lo aplican). Dentro de un botón van con `data-icon="inline-start"` o `"inline-end"` para que el padding se ajuste. Un ícono decorativo lleva `aria-hidden`, y un botón que solo tiene ícono lleva `aria-label`.

## Formatos

Todo valor se formatea con `@/lib/format` y el idioma de la ruta ([10 · i18n › Formatos](./10-i18n.md#formatos)). Nunca se usa `toFixed()` ni se arma `"$" + n` a mano.

| Función | Qué formatea | `en` | `es` |
|---|---|---|---|
| `formatUsd(µ, lang, "balance")` | Saldo, recargas y totales (2 decimales) | `$12.35` | `12,35 US$` |
| `formatUsd(µ, lang, "price")` | Precio por 1M de tokens (hasta 4 decimales) | `$0.075` | `0,075 US$` |
| `formatUsd(µ, lang, "cost")` | Costo de un request (hasta 6 decimales) | `$0.00135` | `0,00135 US$` |
| `formatUsd(µ, lang, "whole")` | Montos redondos, como los botones de recarga | `$10` | `10 US$` |
| `formatUsd(µ, lang, "token")` | Precio de un solo token, **solo en tooltips** | `$0.0000003` | `0,0000003 US$` |
| `formatDiscount(bps, lang)` | Descuento en puntos base | `−87.5%` | `−87,5 %` |
| `formatTokens(n, lang)` | Contexto, compacto | `200K` | `200 mil` |
| `formatCount(n, lang)` | Conteos exactos | `12,481` | `12.481` |
| `formatDate(d, lang)` | Fechas (en UTC, para que el servidor y el navegador coincidan) | `Nov 8, 2026` | `8 nov 2026` |

- **El dinero entra en µUSD** ([ADR-0007](./adr/0007-dinero-en-micro-dolares.md)) y solo se convierte a dólares al mostrarlo.
- Los negativos usan el signo menos tipográfico (`−`), no el guion.

## Componentes de producto

Viven en `src/components/` y están construidos con los átomos. Se ven todos en `/design-system › Patrones de producto`.

| Componente | Archivo | Para qué |
|---|---|---|
| `Container` | `container.tsx` | Ancho máximo y márgenes de la página |
| `PageHeader`, `SectionHeader` | `page-header.tsx` | `h1` y `h2` con descripción y acciones |
| `Price` | `price.tsx` | Cualquier monto, con `tabular-nums` |
| `PriceComparison` | `price.tsx` | ~~oficial~~ y precio cheaptokens.wtf, con etiquetas para lector de pantalla |
| `DiscountBadge` | `discount-badge.tsx` | `−90%` en `success` |
| `ModelTagBadge`, `MODEL_TAG_ICONS` | `model-tag.tsx` | Chip de tag y su ícono. La lista de tags vive en `src/lib/catalog/tags.ts` |
| `ModelId` | `model-id.tsx` | ID de modelo en mono, copiable |
| `CopyButton` | `copy-button.tsx` | Copiar al portapapeles, con confirmación anunciada |
| `CodeBlock` | `code-block.tsx` | Bloque de código con botón de copiar |
| `QuickstartSnippet` | `quickstart-snippet.tsx` | Snippet de conexión en Python, JavaScript y curl. El contenido sale de `src/lib/snippets.ts` |
| `Stat` | `stat.tsx` | Una cifra destacada con su etiqueta. `size="sm"` para cards angostas |
| `ThemeToggle` | `theme-toggle.tsx` | Selector claro, oscuro o sistema |

**Componentes de página** (no reutilizables entre pantallas) viven en subcarpetas y no van a `/design-system`:
- `src/components/site/`: `SiteHeader` (navegación de vidrio flotante), `SiteFooter` y `LanguageSwitcher`.
- `src/components/catalog/`: `ModelCatalog` (búsqueda, filtros y tabla), `ModelPreviewList` y `ModelPriceCard`.

**El texto entra por props.** Ningún componente tiene copy fijo: reciben `copyLabel`, `labels`, `label`, etc. Mientras no existan los diccionarios ([10 · i18n](./10-i18n.md)), los defaults están en inglés. Cuando existan, las páginas pasan el texto desde el diccionario.

## Átomos y composición

- **Los átomos se agregan con** `pnpm dlx shadcn@latest add <componente>`. Cada átomo nuevo se agrega también a `/design-system`.
- **Cambios propios sobre shadcn.** Si un átomo se reinstala con `--overwrite`, hay que volver a aplicar sus cambios:

  | Átomo | Cambio | Por qué |
  |---|---|---|
  | `Badge`, `Alert` | Variantes `success` y `warning` | Los colores con significado ([Color](#color)) |
  | `Button` | `buttonVariants()` devuelve las clases ya fusionadas con `cn` | Sin eso, en un `<Link>` la base (`border-transparent`) le ganaba a la variante y el `outline` salía sin borde |
  | `Dialog`, `AlertDialog` | Overlay con el token `bg-overlay` en vez de `bg-black/10` | Sin colores crudos; en oscuro el 10% no separaba el diálogo de la página |
  | `Dialog` | Props `closeLabel` en `DialogContent` y `DialogFooter` | Sin copy fijo en inglés |
  | `Pagination` | Los links son `<a>` con `buttonVariants()` (no `Button` + `render`), con `tabular-nums`. El texto de "Anterior/Siguiente" se oculta solo visualmente en móvil y sirve de nombre accesible. Se quitaron los `aria-label` fijos en inglés y el "More pages" que estaba dentro de un `aria-hidden` | Rol de link correcto y sin copy fijo |
  | `Slider` | Pulgar con `bg-background` en vez de `bg-white` | Sin colores crudos |
  | Todos los de vidrio | Material liquid glass: `Button`, `Badge`, `Card`, `Alert`, `Dialog`, `AlertDialog`, `DropdownMenu`, `Select`, `Tooltip`, `Tabs`, `Toggle`, `ToggleGroup`, `Input`, `InputGroup`, `Textarea`, `NativeSelect`, `Kbd`, `Empty`, `Switch`, `Checkbox`, `RadioGroup`, `Slider`, `Progress` | [Material › Componente por componente](#componente-por-componente) |
  | `Button` | Presión con `scale(0.96)` y transiciones solo de color, fondo, sombra, escala y filtro (*better-ui* §9 y §12) | Respuesta táctil; `transition-all` animaba propiedades que no cambian |
  | `Badge`, `Tabs`, `Toggle`, `Switch`, `Progress` | `transition-all` → propiedades exactas (*better-ui* §12) | Ídem |
  | `globals.css` | Íconos de lucide a `stroke-width: 1.75` (*better-ui* §14) y utilidad `enter` para la entrada escalonada (§5) | Un solo grosor acorde al texto de 400–500 |
  | `Table` | Prop `regionLabel`: el contenedor se vuelve `role="region"` con nombre y `tabIndex={0}` | Una tabla que se desborda en móvil y no tiene nada enfocable no se podía desplazar con teclado (axe: `scrollable-region-focusable`) |
  | `globals.css` | `--destructive` de tema claro más oscuro | Contraste AA ([Contraste medido](#contraste-medido)) |

- **Cómo se usa cada átomo en cheaptokens.wtf:** está en `/design-system › Átomos`, con su pantalla y sus estados. Los que no tienen uso en el MVP (`Textarea`, `AspectRatio`) están al final, marcados.
- **Links con apariencia de botón:** se usa `buttonVariants()` sobre `<Link>` o `<a>`:
  ```tsx
  <Link href="/models" className={buttonVariants({ variant: "outline" })}>Ver modelos</Link>
  ```
  No se usa `<Button render={<Link />} nativeButton={false}>`, porque Base UI le pone `role="button"` y el lector de pantalla lo anuncia como botón aunque navega. La prop `render` sigue siendo la forma de componer **triggers** (`<DialogTrigger render={<Button />}>`).
- **Acciones destructivas** (revocar una key) siempre pasan por un `AlertDialog`. El botón de confirmar repite la acción ("Revocar key"), no dice "Aceptar".
- **Estados vacíos** con `Empty`: qué falta y un botón que lo resuelve. Nada más.
- **Formularios** con `Field`, `FieldLabel`, `FieldDescription` y `FieldError`. Los campos de dinero llevan `inputMode="decimal"` y `tabular-nums`.
- **Tablas:** toda tabla que pueda desbordarse en móvil lleva `<Table regionLabel="…">`. Los bloques de código ya son enfocables (`CodeBlock`).
- **Nombre de un botón sin texto:**
  - Si solo tiene un ícono SVG, usa `aria-label`.
  - Si muestra letras (un avatar con iniciales), el nombre va como `<span className="sr-only">` y lo visual lleva `aria-hidden`. Con `aria-label`, el texto visible no formaría parte del nombre (WCAG 2.5.3).

## Patrones por pantalla

| Pantalla ([02 · Producto y UX](./02-producto-y-ux.md)) | Se arma con |
|---|---|
| Landing | Display, `QuickstartSnippet`, `PriceComparison` + `DiscountBadge` en la vista previa del catálogo |
| Catálogo | `Table`, `ToggleGroup` (filtros de tag, `multiple`, `outline`, `sm`), `InputGroup` (búsqueda), `Select` (orden), `ModelId`, `ModelTagBadge`, `PriceComparison`, `DiscountBadge`, `Badge variant="warning"` para `deprecated` |
| Dashboard: inicio | `Stat` dentro de `Card`, `Alert` para saldo bajo o en cero, `QuickstartSnippet` en el checklist |
| API keys | `Table`, `Dialog` con `InputGroup` + `CopyButton` + `QuickstartSnippet` para la key nueva, `AlertDialog` para revocar, `Empty` |
| Créditos | `ToggleGroup` (montos rápidos), `Field` + `InputGroup` (monto libre), `Alert variant="success"` al volver del checkout del Merchant of Record |
| Uso | `Stat`, `Table` con `Price kind="cost"`, `Pagination` |
| Docs | `Container size="prose"`, `CodeBlock`, `QuickstartSnippet` |

## Pruebas del sistema de diseño

Las reglas de este documento se verifican solas. Hay tres capas:

| Capa | Comando | Qué revisa |
|---|---|---|
| Fundamentos | `pnpm test` | **Tokens:** recalcula desde `globals.css` cada par de [Contraste medido](#contraste-medido) en los dos temas, más gamut y separación de tonos (`tests/unit/tokens.test.ts`). **Reglas:** escanea el código y falla si hay colores crudos, `nativeButton={false}`, `toFixed()` o montos armados a mano, o si un átomo o componente no está en `/design-system` (`guidelines.test.ts`). **Formatos, tema y precio:** `format`, `theme` y `pricing`. |
| Componentes | `pnpm test` | Cada componente de producto y cada cambio propio sobre shadcn, renderizado con Testing Library: clases de color por significado, `tabular-nums`, nombres accesibles, copiar al portapapeles, menú de tema, paginación como links (`tests/unit/components/`). |
| Vidrio | `pnpm test` y `pnpm test:e2e` | **Tokens:** cada nivel contra el peor fondo, más las alternativas `prefers-reduced-transparency`, `prefers-contrast` y `@supports` en el CSS (`tests/unit/glass.test.ts`). **Átomos:** cada uno con su nivel según su referencia (`glass-atoms.test.tsx`). **Chrome:** blur real, axe sobre el peor fondo, menús y diálogos abiertos, y vidrio opaco con transparencia reducida o más contraste (emulado por CDP), en los dos temas (`tests/e2e/glass.spec.ts`). |
| Navegador real | `pnpm test:e2e` | Cada sección de `/design-system` en Chrome, en claro y en oscuro: **axe** (WCAG 2.1 AA, incluido el contraste real ya pintado) y una **captura de referencia** por sección. También: tema sin flash, foco con teclado, diálogos (foco, Escape, overlay), portapapeles real, y en móvil nada se desborda (`tests/e2e/`). |

- `pnpm check` corre las dos primeras capas. `pnpm test:e2e` construye la app y corre la tercera con el Chrome instalado.
- **Si cambias algo visual a propósito**, regenera las capturas con `pnpm test:e2e:update` y revisa las imágenes nuevas antes de aceptarlas. Están en `tests/e2e/design-system.spec.ts-snapshots/` y son por sistema operativo (`-darwin`).
- Cada sección de `/design-system` lleva `data-section="<título>"`. Una sección nueva entra sola en axe y en las capturas.

## Antes de dar una pantalla por terminada

- [ ] Solo usa tokens semánticos.
- [ ] Se revisó en claro y en oscuro.
- [ ] Se revisó en `en` y en `es`: los precios en español son más anchos.
- [ ] Todo monto pasa por `Price` o `formatUsd`, con `tabular-nums`.
- [ ] Hay un solo botón `default` por vista.
- [ ] El texto viene por props o del diccionario, no fijo en el componente.
- [ ] Los átomos nuevos están en `/design-system`.
- [ ] `pnpm check` pasa, y `pnpm test:e2e` si cambió algo visual.

## Pendientes

- **Colores de gráficas:** `chart-*` siguen grises hasta la fase 2.
