# ADR-0069: La curaduría del catálogo vive en el repo; «Recomendados» es el orden por defecto; la búsqueda es una paleta (⌘K)

- **Estado:** Aceptada. Actualiza [ADR-0011](./0011-tags-curados.md) (dónde viven los tags curados) y [ADR-0055](./0055-catalogo-en-vivo-con-varios-proveedores.md) (cómo se revalida el sitio).
- **Fecha:** 2026-11-22
- **Origen:** Usuario (reporte de un usuario: búsqueda descentrada e inútil en la landing, orden distinto por idioma, «Pesos abiertos» vacío, «primero los más atractivos, luego los más baratos») + Default (el resto)

## Contexto

- **Tags:** desde ADR-0046 el catálogo sale de la lista de InferHub, que solo dice si un modelo acepta imágenes y si razona. Los demás tags curados (`tools`, `open-weights`, `fast`, `coding`) solo se conservaban si ya estaban en la base, y la actualización en vivo los une sin poder quitarlos. Resultado: `open-weights` en 0 modelos, `tools` en 2 de 96, y `vision` en modelos que solo aceptan texto.
- **Orden por idioma:** `/en/models` y `/es/models` son páginas distintas en la caché. La actualización revalidaba con `revalidateTag('catalog', 'max')`: cada página servía su copia vieja en la siguiente visita y se rehacía en segundo plano. Una página con poco tráfico podía quedar varias versiones atrás. En producción, el 2026-11-22, una mostraba 97 modelos y la otra 98, con descuentos distintos. Además, el orden por defecto (mayor descuento) cambia con cada actualización de costos.
- **Búsqueda:** el campo de la cabecera filtraba el catálogo cambiando `?q=` en la URL de la página actual. Fuera de `/models` no hacía nada visible hasta pulsar Enter. Estaba centrado en el hueco entre los lados, no en la pantalla, y no existía en pantallas angostas.

## Decisión

- **`catalog/curation.ts` es la fuente de la curaduría** y se aplica al leer (`toModel`), encima de lo que traiga la base:
  - `CURATED_TAGS` suma (`add`) y quita (`remove`) tags curados por modelo. Cada entrada lleva sus fuentes. `open-weights` solo va donde el autor publicó los pesos del modelo que se sirve.
  - `FEATURED_MODELS` define el orden de «Recomendados».
  - La sincronización escribe en la base los tags sin curaduría (`storedTags`), así quitar una entrada del archivo la deshace.
  - La descripción generada («Admite entradas de texto e imagen») sigue al tag `vision` ya curado.
- **Orden del catálogo:** `featured` (Recomendados, por defecto), `output` (Más baratos), `discount` (Mayor descuento), `name`. Todo empate se resuelve por ID, así el orden es el mismo en cualquier idioma, en el servidor y en el navegador.
- **Revalidación inmediata y solo si cambia algo público:** `refreshCatalog` reporta `catalogChanged` (cambió un precio, descuento, estado o tag; no solo el costo de una ruta). Solo entonces se llama `revalidateTag('catalog', { expire: 0 })`: cada página se rehace en su siguiente visita, sin servir la copia vieja.
- **Búsqueda:**
  - En la cabecera hay un botón que abre una paleta (⌘K, Ctrl K o /) en cualquier página. La paleta usa `Command` de shadcn (cmdk) dentro del `Dialog` de Base UI. Sin texto muestra los recomendados y las páginas. Con texto muestra los primeros resultados y «Ver los N resultados en el catálogo». Enter abre el resultado marcado. En móvil se abre desde el menú.
  - El catálogo tiene su propio campo, que filtra en el lugar.
  - La búsqueda ignora mayúsculas, acentos y signos, y pide cada palabra en el nombre o el ID: «gpt 6.1», «GPT-6.1» y «gpt61» encuentran lo mismo.
  - La cabecera es una rejilla de tres columnas, y la búsqueda queda en el centro exacto.
- **Los filtros del catálogo muestran cuántos modelos tiene cada uno.** Uno sin modelos no se ofrece.

## Consecuencias

- Corregir un tag es un cambio de código revisable, con su fuente, que llega con el siguiente deploy y no depende de sincronizar la base.
- Un modelo nuevo de InferHub entra sin curaduría: solo con `vision` y `reasoning` del proveedor. Hay que agregarlo a `CURATED_TAGS` al revisarlo. Una prueba exige que cada entrada tenga fuente.
- Tras un cambio público del catálogo, la primera visita de cada página espera a que se arme, en vez de recibir la copia vieja. Un costo que se mueve sin cambiar el descuento ya no revalida nada.
- cmdk trae como dependencia piezas de Radix (su propio diálogo), aunque aquí se usa el `Dialog` de Base UI. Es la pieza oficial de shadcn para `Command`.
- «Recomendados» es una lista editorial: hay que revisarla cuando salga o se retire un modelo insignia.

## Alternativas descartadas

- **Curar los tags en la base, con SQL o con `catalog:sync`:** queda fuera de revisión y la actualización en vivo no puede quitar un tag mal puesto.
- **`revalidateTag` con un `expire` corto (60 s):** cada llamada mueve el vencimiento. Con el cron cada minuto, una página poco visitada nunca llegaría a vencer y seguiría sirviendo un catálogo viejo.
- **Que la búsqueda de la cabecera filtre en `/models` y abra la paleta en las demás páginas:** el mismo control haría dos cosas distintas según la página. Es justo lo que se reportó como «raro».
- **Ordenar por inteligencia:** no hay un puntaje de inteligencia con fuente para los 96 modelos. Queda pendiente hasta elegir una fuente.
