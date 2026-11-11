# ADR-0015: i18n con el patrón nativo de Next 16 (`[lang]` + diccionarios)

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Usuario (producto global con i18n) + Default (implementación)

## Contexto

El producto es para todo el mundo. La interfaz tiene que salir en varios idiomas desde el lanzamiento, empezando por inglés y español. Next 16 trae una guía de i18n basada en un segmento `[lang]`, diccionarios cargados en el servidor y `next/root-params` para leer el idioma sin pasarlo por props.

## Decisión

- **Idiomas:** `en` (por defecto) y `es`.
- **Patrón nativo, sin librería:** `src/app/[lang]/` como root layout, `generateStaticParams` por idioma, diccionarios `.ts` tipados en `src/lib/i18n/dictionaries/`, `getDictionary()` con `next/root-params`, y Client Components que reciben los textos como props.
- **Detección en `src/proxy.ts`:** cookie `NEXT_LOCALE` → `Accept-Language` → `en`. Todas las rutas web llevan prefijo de idioma.
- **Formatos con `Intl`.** La moneda es siempre USD.
- **La API (`/v1/*`) no se traduce:** los errores van en inglés.
- Las descripciones del catálogo van en `jsonb` por idioma, con fallback a `en`.

Detalle en [10 · i18n](../10-i18n.md).

## Consecuencias

- Cero dependencias de i18n, con el enfoque que documenta la versión de Next que usamos.
- TypeScript detecta claves faltantes en cualquier idioma.
- Los textos no llegan al bundle del cliente, salvo los que se pasan como props.
- **Sin plurales ICU ni interpolación avanzada.** Para dos idiomas y una interfaz minimalista alcanza con funciones simples. Si los textos se complican, se reconsidera.
- Mover el scaffold actual (`src/app/layout.tsx` y `design-system`) debajo de `[lang]/`.

## Alternativas descartadas

- **`next-intl`:** maduro, con ICU, plurales y navegación con idioma. Es otra dependencia que tiene que seguir el ritmo de los cambios de Next 16 (proxy, Cache Components, root params). Es el candidato natural si el patrón nativo se queda corto.
- **Otras librerías (Lingui, Paraglide, Tolgee…):** suman un paso de compilación o un servicio externo para un problema que hoy es chico.
- **Solo inglés en el MVP:** el usuario pidió explícitamente un producto global con i18n.
- **Idioma por dominio (`cheaptokens.es`, `cheaptokens.com`):** más dominios, más certificados y más configuración, sin ventaja para una herramienta de devs.
