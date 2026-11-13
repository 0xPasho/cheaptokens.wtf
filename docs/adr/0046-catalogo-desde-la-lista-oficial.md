# ADR-0046 · Importar el catálogo desde la lista oficial de InferHub

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Actualiza:** origen de datos de ADR-0012, catálogo de ejemplo de ADR-0029 y cálculo inicial del descuento de ADR-0010.

## Contexto

El usuario solicita sustituir los modelos escritos como ejemplo por los que publica el proveedor. `GET https://api.inferhub.dev/v1/models` es público y devuelve nombres, contexto, modalidades, precios de referencia y ofertas. Contiene alias, entradas gratuitas y varias rutas para un mismo modelo.

## Decisión

`pnpm catalog:refresh` descarga la lista oficial, valida su esquema y genera una instantánea versionada en `catalog/generated/`. `catalog/models.ts` exporta sus modelos; `catalog/upstreams.ts` utiliza sus rutas explícitas. El primer refresco importó 89 modelos desde 461 entradas, en 12 autores. La web deja de marcar el catálogo como muestra.

Se publican modelos de chat de pago con autor identificable, contexto y precios positivos. Los alias, el free pool, los endpoints de generación no soportados y las entradas incompletas se excluyen con un conteo en `import-report.json`. Los modelos se agrupan por autor y nombre normalizado, sin exponer el prefijo de enrutamiento al cliente. Una ruta conserva juntos su contexto, precios y modalidades; no se mezclan los datos de distintas rutas.

Los topes de coste parten de la mediana positiva de las ofertas publicadas para cada ruta, no de su mínimo. Entre rutas equivalentes se elige la que permite mayor descuento. El descuento compartido de input/output es el mayor porcentaje entero, hasta 90%, que cubra ambos topes más el 10% de margen existente. Si ni el precio de referencia cubre el margen, la ruta se excluye. Los topes siguen viajando en cada request; si no hay capacidad bajo ellos, la solicitud puede fallar sin cambiar el precio publicado. El coste real sigue siendo el de `usage.cost` al terminar.

Los precios de referencia son los reportados por el proveedor, no una verificación independiente con el creador: `officialPriceVerifiedAt` permanece en `null`. Se conserva el enlace de precios del creador y la interfaz explica esa verificación pendiente.

Los IDs anteriores que desaparecen quedan `retired`, para conservar el historial y permitir el upsert sin borrar registros. Las pruebas financieras usan fixtures fijas independientes de las variaciones del proveedor; las pruebas del importador verifican los datos reales generados, el margen, las exclusiones, las rutas anidadas y la ausencia de costes internos en la API pública.

## Operación

1. Ejecutar `pnpm catalog:refresh` para descargar y generar los archivos, sin gastar tokens ni necesitar una API key.
2. Revisar el diff y `catalog/generated/import-report.json`.
3. Ejecutar `pnpm catalog:sync` con `DATABASE_URL` configurada para actualizar la base del gateway e invalidar su caché.

La web usa la instantánea local y no depende de una consulta al proveedor en cada visita ni durante el build. Un fallo de red, un esquema inválido o una respuesta sin modelos elegibles no sustituye el catálogo por datos vacíos. No se agregan consultas de inferencia pagadas. Esta importación no modifica los requisitos pendientes para habilitar producción descritos en ADR-0028.
