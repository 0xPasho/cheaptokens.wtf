# ADR-0055: El catálogo vigente vive en la base, se actualiza solo y admite varios proveedores

- **Estado:** Aceptada. Cambia de dónde sale el catálogo en [ADR-0012](./0012-catalogo-en-repo.md) y [ADR-0046](./0046-catalogo-desde-la-lista-oficial.md): el archivo del repo pasa a ser la semilla y el respaldo.
- **Fecha:** 2026-11-17
- **Origen:** Usuario (precios en tiempo real, y que InferHub no sea el único proveedor) + Default (el cómo)

## Contexto

- Los costos de InferHub cambian en horas ([ADR-0053](./0053-margen-minimo-de-30.md)) y cada request se cobra a su costo real ([ADR-0054](./0054-cobro-por-costo-real.md)).
- El catálogo se regeneraba a mano (`pnpm catalog:refresh` + `pnpm catalog:sync`). El sitio lo leía de un archivo del repo, fijo desde el build; el gateway, de la base.
- Si un costo subía por encima del tope, los requests de ese modelo fallaban hasta la siguiente regeneración manual.
- InferHub es el primer proveedor, no el único. El importador, el script y `catalog/upstreams.ts` lo daban por hecho.

## Decisión

### Proveedores

- Un proveedor implementa `CatalogProvider` (`src/lib/catalog/providers/types.ts`): los datos de su upstream y `loadOffers()`, que devuelve por cada modelo su ficha y su ruta con costo.
- Se registran en `src/lib/catalog/providers/index.ts`. Hoy: `inferhubProvider`. Agregar otro es escribir su adaptador y sumarlo a esa lista; el gateway ya intenta las rutas por prioridad.

### Mezcla (`mergeCatalog`, `src/lib/catalog/merge.ts`)

- **El precio publicado de un modelo sale de la ruta que permite el mayor descuento.**
- **Las demás rutas quedan como respaldo solo si su costo cabe bajo ese precio** (costo × 1.3 ≤ precio). Se ordenan de la más barata a la más cara. Las que no caben se descartan y se cuentan en el reporte.
- `hidden` y `deprecated` se conservan. Un modelo que ya nadie ofrece pasa a `retired`; si vuelve, se reactiva.

### Actualización (`refreshCatalog`, `src/lib/catalog/refresh.ts`)

- Trae la lista de cada proveedor, mezcla, valida y escribe en la base con `syncCatalog`.
- **Un proveedor que falla conserva sus rutas vigentes.** Si fallan todos, o el resultado no tiene modelos, no se escribe nada.
- La dispara `GET /api/internal/refresh-catalog`, con `Authorization: Bearer` igual a `CRON_SECRET` o a `INTERNAL_REVALIDATE_SECRET`. `vercel.json` la programa **cada minuto**, el mínimo de un cron de Vercel. Si los proveedores dan lo mismo que ya está en la base, no escribe ni revalida. Desde la terminal: `pnpm catalog:live`.
- Al terminar revalida el tag `catalog`.

### Lectura

- **El sitio y `GET /v1/models` leen de la base** (`loadCatalogEntries`, `src/lib/catalog/live.ts`), con caché de un minuto y el tag `catalog`.
- **El archivo del repo es el respaldo:** sin `DATABASE_URL` (build, pruebas), con la base vacía o si no responde en 3 segundos.
- El gateway sigue leyendo de la base, con su caché bajada de 60 a 15 segundos (`src/lib/server/gateway-deps.ts`).
- `/design-system` sigue usando el archivo, para que sus capturas no cambien solas.

## Consecuencias

- **Un cambio de costo llega al tope del gateway en unos 75 segundos como máximo** (60 del cron + 15 de caché) y al precio publicado en el sitio en cerca de un minuto. El cobro de cada request ya sigue al costo real al instante (ADR-0054).
- **El precio publicado cambia solo.** Un cliente puede ver un precio distinto al de hace una hora. Los paquetes y los límites de plan no cambian de valor: se miden en dólares, y cada request gasta lo que costó.
- **El cron cada minuto pide un plan de Vercel que lo permita** (el plan Hobby solo deja uno al día y rechaza el deploy). Hay que definir `CRON_SECRET` en Vercel.
- **`pnpm catalog:sync` vuelve a escribir el archivo del repo en la base:** sirve para sembrar una base nueva. En una base viva, el siguiente cron lo corrige.
- **Con un segundo proveedor casi no habrá respaldo** mientras se exija que quepa bajo el precio publicado: una ruta más cara casi nunca cabe. Aceptar rutas de respaldo más caras (cobrando su costo real, por encima de lo publicado) es una decisión pendiente para cuando exista ese proveedor.
- **Dos actualizaciones simultáneas** escriben lo mismo; si chocan, una falla y la siguiente lo repite.
- El catálogo de respaldo del repo envejece: conviene regenerarlo (`pnpm catalog:refresh`) antes de cada release.

## Alternativas descartadas

- **Cron cada 5 minutos:** fue la primera versión; los costos cambian más rápido que eso.
- **Consultar al proveedor en cada request:** suma su latencia y sus caídas a cada llamada del cliente. El tope de precio y el cobro por costo real ya protegen cada request.
- **Solo un cron que regenere el archivo y haga commit:** cada cambio de precio sería un deploy.
- **Actualizar al recibir tráfico, sin cron:** depende de que haya visitas y mezcla la escritura con la lectura.
