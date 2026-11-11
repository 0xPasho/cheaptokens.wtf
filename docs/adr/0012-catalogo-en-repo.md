# ADR-0012: Catálogo versionado en el repo y sincronizado a la BD

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

El catálogo (modelos, precios, descuentos, upstreams y costos) cambia pocas veces a la semana, pero cada cambio afecta el dinero. Necesita validación (margen, tags, IDs permanentes), historial y una forma de actuar en una emergencia sin esperar un deploy.

## Decisión

- **Fuente de verdad:** `catalog/models.ts` y `catalog/upstreams.ts`, tipados y validados con zod.
- **`pnpm catalog:sync`** valida (esquema, margen mínimo, tags calculados, que ningún ID se borre) y hace upsert a Postgres. Después invalida la caché con `revalidateTag('catalog', 'max')` mediante un endpoint interno protegido.
- **Nunca borra filas.** Para sacar un modelo se pasa a `retired`.
- **Interruptor de emergencia:** `model_upstreams.ops_disabled_at` se edita a mano en la base, y la sincronización nunca toca esa columna.
- El gateway cachea el catálogo en memoria por 60 s.
- **Sin panel de admin en el MVP.**

## Consecuencias

- Cada cambio de precio queda en git con autor, fecha y motivo, y se revisa en un PR.
- La validación de margen corre antes de que un precio llegue a producción.
- Apagar un upstream en emergencia tarda menos de 60 s, sin deploy, y un deploy no lo revierte.
- Cambiar un precio requiere un commit y correr la sincronización. Es más lento que un panel, pero más seguro.
- Los costos de los upstreams quedan en el repo, que **debe ser privado**.

## Alternativas descartadas

- **Panel de admin desde el día uno:** más superficie que construir y asegurar (roles, auditoría y validación en la interfaz) para algo que cambia pocas veces. Queda para la fase 2, sobre los mismos datos.
- **Catálogo solo en código, sin base de datos:** el interruptor de emergencia exigiría un deploy, y los reportes en SQL no podrían cruzar con el catálogo.
- **Editar la base a mano como fuente de verdad:** sin historial, sin revisión y sin validación de margen.
