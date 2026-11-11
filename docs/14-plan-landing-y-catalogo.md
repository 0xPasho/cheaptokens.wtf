# 14 · Plan: landing, catálogo y detalle de modelo

> **Estado (2026-11-08): hecho.** Los pasos 0 a 5 están implementados y probados. El paso 6 (artifact) está en `artifacts/landing-y-catalogo/`, pendiente de subir a Deska. Lo que se encontró al construir está en [Lo que salió al construir](#lo-que-salió-al-construir).

Plan para construir las tres páginas públicas con el [sistema de diseño](./13-sistema-de-diseno.md) (material liquid glass, [ADR-0025](./adr/0025-material-liquid-glass.md)) y una pasada de pulido con las pautas de *better-ui*. Fecha: 2026-11-08.

## Qué se construye

| Vista | Ruta | Trabajo que resuelve ([02 · Producto y UX](./02-producto-y-ux.md)) |
|---|---|---|
| Landing | `/[lang]` | Entender qué es en 5 segundos y llegar a la API key |
| Catálogo | `/[lang]/models` | Comparar modelos por precio, descuento y capacidades |
| Detalle de modelo | `/[lang]/models/[author]/[model]` | Ver el precio completo de un modelo y copiar el snippet con su ID |

**El detalle se adelanta de la fase 2 a la fase 1** a pedido del dueño del producto ([11 · Roadmap](./11-roadmap.md)).

## Paso 0 · Base

1. **i18n con el patrón nativo** ([10 · i18n](./10-i18n.md), [ADR-0015](./adr/0015-i18n-nativo.md)):
   - Layout raíz en `src/app/[lang]/` con `generateStaticParams` para `en` y `es`.
   - Diccionarios tipados en `src/lib/i18n/`.
   - `proxy.ts` que redirige `/` → `/{idioma}` según la cookie `NEXT_LOCALE` y luego `Accept-Language`.
   - `/design-system` se mueve a `/[lang]/design-system`.
2. **Catálogo en el repo** ([ADR-0012](./adr/0012-catalogo-en-repo.md)): `catalog/models.ts`, tipado, con el precio cheaptokens.wtf derivado (`applyDiscount`).
   - Una prueba valida las reglas de [06](./06-catalogo-y-precios.md): IDs únicos y permanentes, el autor coincide con el prefijo del ID, solo tags de la lista y tags calculados correctos (`long-context`, `cheap`).
   - **Los precios son de ejemplo** hasta definir el catálogo de lanzamiento ([12 · Preguntas abiertas #1](./12-preguntas-abiertas.md#1-elegir-los-upstreams-de-producción)). Las páginas lo dicen.
3. **Marco del sitio:**
   - `SiteHeader`: barra de navegación de vidrio, fija arriba. Apple pone la navegación en la capa de vidrio.
   - `SiteFooter`: con el selector de idioma.

## Paso 1 · Landing (`/[lang]`)

En orden, de arriba hacia abajo. La referencia de cada bloque va entre paréntesis.

1. **Hero** (refs 1 y 3: resplandor arriba y titular centrado):
   - Titular en dos tonos (ref 12): "Un endpoint. Todos los modelos. **Hasta 90% menos.**"
   - CTA prominente "Obtén tu API key" y CTA de vidrio "Ver modelos".
   - Entrada escalonada de ~100 ms entre titular, texto, CTAs y snippet (*better-ui* §5). Se ve una vez y se apaga con movimiento reducido.
2. **El snippet en un compositor de vidrio** (ref 1): `QuickstartSnippet` dentro de un panel con borde luminoso y resplandor. Muestra que solo cambian `base_url` y `api_key`.
3. **Cómo funciona en 3 pasos** (ref 3, "01 · 02 · 03"): recarga, crea una key, copia el snippet. Lo dicen [01 · Visión](./01-vision.md) y el checklist del dashboard.
4. **Vista previa del catálogo:** los 6 modelos con más descuento, con `PriceComparison` y `DiscountBadge`. Link "Ver los N modelos".
5. **Cifras** (ref 12): números grandes y ligeros con `Stat`, como "−90%", "1 URL" y "N modelos".
6. **CTA final** y footer.

## Paso 2 · Catálogo (`/[lang]/models`)

- **`PageHeader`** con el número de modelos.
- **Barra de filtros:**
  - Búsqueda con `InputGroup` y el atajo `/`.
  - Chips de tag con `ToggleGroup multiple`; varios tags se combinan con Y.
  - Orden con `Select`: mayor descuento, precio de output o nombre.
  - Contador de resultados en una región `aria-live`.
- **`Table regionLabel`:**
  - El nombre del modelo es el link a su detalle.
  - `ModelId` copiable y tags bajo el nombre.
  - Contexto, input y output por 1M, descuento.
  - Badge `warning` para los `deprecated`.
- **Estado vacío** con `Empty` y el botón "Limpiar filtros".
- **Aviso** discreto si el catálogo es de ejemplo.

## Paso 3 · Detalle (`/[lang]/models/[author]/[model]`)

- **Encabezado:**
  - Link "← Modelos" para volver.
  - Nombre, autor, `ModelId` copiable, tags y estado.
  - Descripción en el idioma de la ruta.
- **Card de precio** (ref 7: precio tachado y precio grande):
  - Input y output por 1M con el oficial tachado, y `DiscountBadge`.
  - El precio por token en tooltip.
  - Origen y fecha del precio oficial.
- **Ejemplo de costo:** un request típico de 2,000 tokens de entrada y 500 de salida ([06](./06-catalogo-y-precios.md#costo-de-un-request)), con el costo cheaptokens.wtf, el costo oficial y el ahorro en `success`.
- **"Úsalo":** `QuickstartSnippet` con el ID del modelo ya puesto.
- **Especificaciones:** contexto, estado, fecha de retiro si aplica.
- **Modelos parecidos:** los que comparten más tags.
- **Rutas:**
  - Todas son estáticas (`generateStaticParams`, un modelo × dos idiomas).
  - Un ID desconocido da 404 con `not-found`.

## Paso 4 · Pulido con *better-ui*

| Pauta | Cambio |
|---|---|
| §9 Presión con `scale(0.96)` | `Button` deja `translate-y-px` y usa `active:scale-[0.96]` |
| §12 Transicionar solo lo que cambia | `transition-all` → propiedades exactas en `Button`, `Badge`, `Tabs`, `Toggle` |
| §14 Grosor del ícono según el texto | Lucide pasa de 2 px a 1.75 px en todo el sitio (texto de 400–500) |
| §5 Entrada escalonada solo en momentos poco frecuentes | Solo el hero de la landing. Nada en hover ni en filtros |
| §16 Restricción de movimiento | Filtrar y ordenar el catálogo es instantáneo, sin animación |
| §1 Radios concéntricos | Compositor del hero: el radio exterior es el interior más el margen |
| §3 Sombra para elevación | Ya está: el vidrio usa `box-shadow`, y los bordes quedan para estructura |

## Paso 5 · Pruebas

- **Unitarias:**
  - Reglas del catálogo.
  - Los diccionarios `en` y `es` tienen las mismas claves.
  - Negociación de idioma del proxy.
  - Filtros y orden del catálogo como funciones puras.
- **Chrome (Playwright):** cada página en `en` y `es`, en claro y oscuro:
  - axe (WCAG 2.1 AA).
  - Una captura por página.
  - Móvil sin desbordes.
  - El catálogo filtra, busca y ordena.
  - Cada modelo tiene su página de detalle.
  - Un ID desconocido da 404.
  - `/` redirige al idioma.

## Paso 6 · Artifact

Una foto estática de las tres páginas y de `/design-system`, con links entre ellas, en `artifacts/landing-y-catalogo/`. Se sube a Deska cuando su servicio responda.

## Lo que salió al construir

- **404 real para modelos desconocidos.** Con `cacheComponents` no existe `dynamicParams = false`. Con Partial Prefetching, un ID fuera del catálogo respondía **200** con la página de error: el shell sale antes de que `notFound()` corra. Lo resuelve `ensureStatic = "navigation"` en la página de detalle, porque la primera visita espera el render completo. Una prueba exige el 404.
- **Las cifras del costo de ejemplo se pisaban** en `text-4xl`. `Stat` ganó `size="sm"` para cards angostas.
- **El header en móvil:** si se ocultaba toda la navegación, no había forma de llegar a Modelos. Solo se oculta "Cómo funciona".
- **"Obtén tu API key" lleva a "Cómo funciona"** mientras no existan el registro y el dashboard.

## Fuera de este plan

- Login (Clerk), dashboard, pagos y gateway: otras fases del [roadmap](./11-roadmap.md).
- Filtros guardados en la URL: el estado vive en la página. Llevarlo a la URL es el siguiente paso, para poder compartir una búsqueda.
- Logos de los autores: no hay marca propia para cada uno todavía.
