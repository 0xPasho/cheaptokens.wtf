# ADR-0071: «Cómo funciona» tiene página propia, `/[lang]/how-it-works`, y la landing lleva a ella sin perder secciones

- **Estado:** Aceptada. Amplía el mapa de páginas de [02 · Producto y UX](../02-producto-y-ux.md#mapa-de-páginas) y cambia adónde apunta «Cómo funciona», que [ADR-0060](./0060-landing-explica-el-producto.md) mandaba a una sección de la landing.
- **Fecha:** 2026-11-22
- **Origen:** Usuario (una página solo para cómo funciona, con la estructura y el estilo de la landing; aprobó el artefacto «Cómo funciona · cheapllm.wtf»; no quitar nada de la landing y agregarle links de más información) + Default (las secciones, el ejemplo, los textos y adónde lleva cada link)

## Contexto

- Precios, Modelos y Docs tienen página propia. «Cómo funciona», en la cabecera y en el pie, bajaba a «¿Cómo puede costar tan poco?» de la landing (`/#why`): cuatro frases, sin el recorrido de un request.
- Lo que pasa con un request está repartido en documentos internos: la key ([05](../05-api-keys.md)), la reserva ([ADR-0066](./0066-reserva-por-request.md)), la ruta y los reintentos ([07](../07-upstreams.md#selección-y-fallback)), el cobro ([ADR-0054](./0054-cobro-por-costo-real.md)) y lo que no se guarda ([ADR-0014](./0014-no-guardar-contenido.md)).
- Lo que el sitio puede prometer está acotado por [ADR-0062](./0062-lo-que-el-sitio-promete.md): ni el proveedor ni el margen.

## Decisión

### `/[lang]/how-it-works`

Ocho bloques con el ritmo de la landing: el encabezado centrado, una banda (`.nr-mk-band`) sí y otra no, y el mismo cierre.

| # | Bloque | Qué muestra | Pieza |
|---|---|---|---|
| 01 | Encabezado | «Mismo request. Mismo modelo. Pagas menos.» y un dibujo: tu código → `api.cheapllm.wtf` (las tres cosas que hace) → el modelo que pediste, de ida y vuelta. Debajo, modelos y autores del catálogo, «los precios se actualizan cada minuto» y «tus prompts no se guardan» | `HowFlow`, sobre `.nr-mk-flow`, que había quedado sin uso |
| 02 | Qué pasa con cada request | Seis pasos: revisa la key, comprueba que alcance, busca la ruta más barata, reintenta (hasta tres intentos), devuelve la respuesta y cobra lo que costó. Los cuatro primeros dicen con qué error se detienen y que cuestan $0. A la derecha, el recibo de un request de ejemplo que marca el paso que estás leyendo | `RequestLife` (cliente) |
| 03 | ¿Cómo puede costar tan poco? (banda) | Tres hechos (capacidad comprada, la ruta más barata cada minuto, el precio es un tope) y una gráfica: precio oficial, precio publicado y lo que se paga, que no pasa la línea del tope | `WhyCheaper` con `CapChart` |
| 04 | Tres cosas con las que puedes contar | Responde el modelo que pediste, si falla no pagas, tus prompts no se guardan. Cada tarjeta con su prueba en la caja de abajo | `Promises`, con las tarjetas de «Una key para cada uso» |
| 05 | De dónde cobra (banda) | El reparto entre plan y créditos, con link a `/pricing` | `BillingFlow` |
| 06 | Migrar | El diff de dos líneas, los tres pasos y con qué funciona | `SwitchDiff` |
| 07 | Preguntas (banda) | Cinco de `/faq` (`HOW_FAQ`): quién elige el modelo, si cambian los precios, si se cobra un request fallido, si se guardan los prompts y qué endpoints hay | `FaqList` |
| 08 | Cierre | El último llamado al registro | `FinalCta` |

- **El ejemplo es una request típica** (`TYPICAL_REQUEST`: 20 mil de entrada y 2 mil de salida) **con el modelo de referencia del dashboard** (`REFERENCE_MODEL_ID`, Claude Sonnet 5.5) y precios del catálogo en vivo. El recibo dice «Cobrado, como máximo» con el precio publicado y «Ahorras al menos…», porque el cobro real puede ser menor ([ADR-0054](./0054-cobro-por-costo-real.md)). Lo reservado es la request con la salida por defecto de [ADR-0066](./0066-reserva-por-request.md). La key es un ejemplo con el formato de [05](../05-api-keys.md).
- **La barra de «Lo que pagas» es un dibujo, no un dato:** llega al 88 % del tope para mostrar que puede quedar por debajo. Su cifra dice «hasta» el precio publicado.
- **Los errores de cada paso salen de [04 · API › Errores](../04-api.md):** `401 invalid_api_key`, `402 insufficient_credits`, `503 no_upstream_available` y `502 upstream_error`. Son código: no se traducen.
- **«Reintenta, hasta tres intentos» no dice «otro proveedor».** Hoy los reintentos cambian de cuenta dentro del mismo upstream ([ADR-0057](./0057-varias-cuentas-por-upstream.md)); la frase es cierta con uno o con varios.
- **El recibo marca el paso que cruza el centro de la pantalla;** pasar el cursor o el foco por un paso lo fija. Lo que todavía no pasa va en `--muted-foreground` y no con opacidad, para que axe no encuentre texto sin contraste. En una columna (≤ 1080 px) el recibo va debajo y sin ese estado.

### Navegación y links de más información

- **«Cómo funciona» lleva a `/[lang]/how-it-works`** en la cabecera (con `aria-current`), en el menú móvil, en el pie y en la paleta de búsqueda. En la cabecera sigue siendo el primer link que se oculta por debajo de 1180 px.
- **La landing no pierde ninguna sección.** Cada una que tiene más detalle en otra página lleva un link de texto con flecha, el de «Ver todas las preguntas»:
  - «¿Cómo puede costar tan poco?» → «Ver cómo funciona» (`/how-it-works`);
  - «Migrar» → «Leer los docs» (`/docs#quickstart`), también en `/how-it-works`;
  - «Una key para cada uso» → «Más sobre las API keys» (`/docs#keys`).
  - Precio a la vista, Precios y Preguntas ya tenían el suyo.

## Consecuencias

- **La página repite partes de la landing** (los motivos, el reparto, el diff, el cierre). Es a propósito: quien entra directo a `/how-it-works` ve el recorrido completo. Al cambiar uno de esos componentes, cambian las dos páginas.
- **Si una regla del gateway cambia, hay que revisar los textos:** los pasos citan la reserva (ADR-0066), los tres intentos (07), el precio como tope (ADR-0054) y la actualización cada minuto (ADR-0055). Si se aceptan rutas de respaldo más caras que el precio publicado ([ADR-0055](./0055-catalogo-en-vivo-con-varios-proveedores.md)), el recibo y la gráfica dejan de ser ciertos, igual que las frases que lista ADR-0062.
- **Hay capturas nuevas** (`como-funciona-{en,es}-{light,dark}`) y las de la landing cambian por los links.
- **El sitemap, cuando exista ([16](../16-plan-sitemap.md)), tiene que incluir `/how-it-works`.**

## Alternativas descartadas

- **Seguir bajando a `/#why`:** cuatro frases no explican qué pasa con un request, y los otros links de la cabecera ya son páginas.
- **Quitar de la página lo que repite la landing** (el reparto, el diff): se propuso y el usuario prefirió no recortar.
- **Quitar secciones de la landing y mandar todo a `/how-it-works`:** la landing tiene que explicar el producto sin otro clic ([ADR-0060](./0060-landing-explica-el-producto.md)).
- **Botones en vez de links de texto para «más información»:** la landing ya usa el link con flecha para lo mismo; un botón competiría con «Obtén tu API key».
- **Un cobro de ejemplo inventado por debajo del tope en el recibo:** sería un número que no sale del código. Se muestra el tope con «como máximo».
- **Atenuar con opacidad los pasos que faltan:** baja el contraste del texto por debajo de 4.5:1.
