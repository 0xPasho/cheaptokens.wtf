# ADR-0060: La landing explica el producto; el catálogo se queda en `/models`

- **Estado:** Aceptada. Cambia el contenido de `/[lang]` de [02 · Producto y UX › Landing](../02-producto-y-ux.md#landing-lang) y del plan de [14](../14-plan-landing-y-catalogo.md#paso-1--landing-lang).
- **Fecha:** 2026-11-17
- **Origen:** Usuario (una vista que explique qué es cheapllm.wtf y cómo funciona, simple, con precios, las formas de usarlo, un vistazo a los grupos del catálogo y un camino corto a Modelos; aprobó el artefacto «Landing explicativa» tal como está) + Default (las secciones, los datos y las reglas del vistazo)

## Contexto

- `/[lang]` mostraba el mismo catálogo que `/[lang]/models`. Quien llegaba por primera vez veía 94 tarjetas sin saber qué es un gateway, cuánto cuesta ni cómo se paga.
- Ya existen planes con límites ([ADR-0049](./0049-suscripcion-con-limites.md), [ADR-0052](./0052-precios-de-los-planes.md)), créditos en USDC ([ADR-0058](./0058-deposito-por-cuenta-y-saldo.md)) y keys con fuente de cobro ([05 · API keys](../05-api-keys.md#fuente-de-cobro-y-modelos)). Nada de eso se explicaba fuera del dashboard.
- Las claves `hero`, `steps`, `preview`, `stats` y `finalCta` del diccionario eran de la landing anterior y ya no se usaban. `steps` todavía decía «Sin suscripción».

## Decisión

### `/[lang]` es la landing; `/[lang]/models` no cambia

La landing tiene ocho secciones, de la que más importa a la que menos. Viven en `src/components/site/marketing/` y la composición en `src/app/nibblerouter.css` (`nr-mk-*`).

| # | Sección | Qué muestra |
|---|---|---|
| 01 | Qué es | El titular, una línea de qué es, «Obtén tu API key» y «Ver los N modelos», y `QuickstartSnippet` con las dos líneas que cambian resaltadas |
| 02 | Precio a la vista | Seis modelos conocidos (`PRICE_STRIP_MODELS`) con el precio oficial tachado, el precio cheapllm.wtf y el descuento, por 1M de tokens de salida |
| 03 | Cómo funciona | Tu código → `api.cheapllm.wtf` → el modelo, los tres pasos al primer request y tres garantías |
| 04 | Vistazo al catálogo | Los grupos de la sidebar de Modelos, por capacidad o por autor, con cuatro tarjetas cada uno |
| 05 | Precios | Plus, Pro y Max junto a Créditos, cómo se reparte un request entre plan y créditos, y cómo se paga |
| 06 | Una key para cada uso | Tres casos con la fuente de cobro, el límite de gasto y los modelos de su key, y las herramientas compatibles |
| 07 | Preguntas | Siete preguntas de `/faq` y un link a todas |
| 08 | Cierre | El último llamado al registro |

- **Todo número sale del código:** el conteo de modelos y autores y los precios, del catálogo en vivo ([ADR-0055](./0055-catalogo-en-vivo-con-varios-proveedores.md)); los planes, de `PLANS`; las requests típicas, de `typicalRequestsIn` (la misma cuenta que el dashboard); el depósito mínimo y el tope del excedente, de constantes que una prueba compara con las originales.
- **«Hasta N % menos» se calcula** con el mayor descuento del catálogo (`maxDiscountBps`). La frase no puede quedar desfasada del catálogo.
- **La cabecera suma «Precios»** (`/[lang]/pricing`) y «Cómo funciona» apunta a `/[lang]#how-it-works`. El footer suma Modelos, Precios y Preguntas frecuentes.

### Vistazo al catálogo

- **Los mismos grupos que la sidebar de Modelos.** Por capacidad solo se muestran los que ayudan a elegir (`PEEK_TAGS`): razonamiento, código, económico, visión y rápido. Fuera, `open-weights` (0 modelos el 2026-11-17), `tools` (2) y `long-context` (92 de 94).
- **Cuatro tarjetas por grupo, mayor descuento primero.** Por capacidad, una por autor antes de repetir: sin esa regla, razonamiento mostraría cuatro variantes del mismo autor. Por autor, solo el orden por descuento.
- **«Ver los N de grupo» abre `/[lang]/models?tags=…` o `?author=…`,** parámetros que el catálogo ya entiende. El catálogo no cambia.
- **La tarjeta es la del catálogo** ([ADR-0042](./0042-tarjetas-de-modelos-en-dos-capas.md), [ADR-0043](./0043-tarjeta-clara-arriba-y-autor-abajo.md)) **con el precio de salida agregado.** En la landing el precio es el argumento.
- **Las tarjetas se arman en el servidor;** un componente de cliente (`PeekSwitcher`) solo elige cuál grupo se ve.

### Componentes

- `QuickstartSnippet` gana `highlightConnection` y `CodeBlock` gana `highlight`: resaltan las líneas con la base URL y la API key. El resaltado es neutro, porque `success` solo significa dinero a favor ([13 · Sistema de diseño](../13-sistema-de-diseno.md)).
- Se instala `Accordion` de shadcn para las preguntas, con el chevron de kubai en lugar del de lucide, y se muestra en `/design-system`.

## Consecuencias

- **La landing deja de ser una página de catálogo.** Quien busca un modelo llega a Modelos en un clic: «Ver los N modelos», el vistazo o la búsqueda de la cabecera.
- **Las capturas de la landing cambian** (`pages.spec.ts`) y hay capturas nuevas para `/pricing` y `/faq` ([ADR-0061](./0061-paginas-de-precios-y-preguntas.md)).
- **Si un modelo de `PRICE_STRIP_MODELS`, `ESTIMATOR_MODELS` o `USAGE_TABLE_MODELS` sale del catálogo en vivo, simplemente no se muestra.** Una prueba exige que existan en el catálogo del repo; las listas hay que revisarlas cuando el catálogo cambie de generación.
- **El título de la página (`meta.homeTitle`) sigue diciendo «Hasta 90 %» fijo.** El titular visible se calcula; el `<title>` todavía no.
- **El vistazo carga 17 grupos de cuatro tarjetas en el HTML.** Es poco, y evita mandar el catálogo entero al navegador.
- `ModelPreviewList` (la vista previa de la landing anterior) queda sin uso.

## Alternativas descartadas

- **Dejar el catálogo en `/[lang]` y poner la explicación en otra ruta:** la primera visita seguiría sin saber qué es el producto.
- **Mostrar todos los grupos de la sidebar en el vistazo:** «Pesos abiertos» vacío y «Contexto largo» con casi todo el catálogo no ayudan a elegir.
- **Ordenar las tarjetas del vistazo solo por descuento:** saldrían variantes del mismo modelo y autores que nadie conoce.
- **Una lista de modelos destacados por grupo, escrita a mano:** envejece cada vez que el catálogo cambia, y el catálogo cambia solo cada minuto.
