# 16 · Plan: sitemap e indexación

> **Estado (2026-11-12): borrador.** Las decisiones de §1 están tomadas. Faltan las tres preguntas de §8; mientras no se contesten, valen sus defaults.

## Objetivo

Un sitemap como el de Deska (`~/Projects/deska/deska-web`, `docs/seo-playbook.md` §4), **copiado literalmente**, que enrute:

- las páginas fijas y los docs;
- cada modelo del catálogo;
- una página por autor, por tag y por par de modelos comparados (páginas nuevas de este plan);
- el blog, que viene después y usa la misma lógica que el de Deska.

Además, metadata por página (canónica y alternativas de idioma recíprocas) y un `robots.ts`. Sin esto el sitemap no sirve: hoy cada página declara como alternativas `/en` y `/es`, que son la home (`src/app/[lang]/layout.tsx:27`, pendiente anotado en `docs/15-plan-gateway.md`).

**Fuera de este plan:**

- las tarjetas OG por página (Deska las arma dentro de `pageMetadata`, pero son otro trabajo);
- las páginas del blog (`/blog`, `/blog/[slug]`) y su pipeline de contenido, salvo lo que decida §8.2;
- verificar la propiedad en Search Console y enviar el sitemap (lo hace el dueño, por DNS).

## 1. Decisiones

| # | Decisión | Origen | Por qué |
|---|---|---|---|
| D1 | Copiar la estructura de Deska tal cual: índice en `/sitemap.xml`, trozos `/sitemap/{id}.xml`, ids numéricos para el blog y con prefijo para cada familia, 1.000 registros por trozo, orden estable por id | Usuario | Viene un blog con la misma lógica que el de Deska; una sola forma para los dos proyectos |
| D2 | Se indexan todos los modelos visibles (`active` y `deprecated`) en los dos idiomas | Default | El precio comparado es un dato propio; 89 páginas es poco riesgo de contenido pobre |
| D3 | Páginas nuevas: por autor, por tag y comparaciones | Usuario | Son el equivalente de makers, categorías y colecciones de Deska |
| D4 | `deprecated` entra al sitemap; `retired` sigue dando 404 y no entra | Default | Antes del lanzamiento no hay URLs indexadas que perder |
| D5 | `SITE_URL = https://cheaptokens.wtf`; `x-default` apunta a inglés | Default | ADR-0026; igual que `languageAlternates()` de Deska |
| D6 | `robots.ts` bloquea todo (`Disallow: /`) fuera de producción (`VERCEL_ENV`) | Default | Los previews no deben indexarse |
| D7 | `/design-system`, `/api` y `/v1` quedan fuera del sitemap y bloqueadas | Default | `/design-system` es una referencia interna; `/v1` es la API |
| D8 | `lastModified` solo con una fecha que represente el contenido; hoy ningún modelo tiene una | Default | Regla de Deska: nunca `new Date()` ni la fecha del snapshot, que cambia en cada refresh |
| D9 | Nunca entran URLs de búsqueda ni de filtros (`/models?tags=…`) | Default | Regla de Deska |

## 2. Qué se copia, archivo por archivo

| Deska (`deska-web/src/…`) | cheaptokens (`src/…`) | Cambia |
|---|---|---|
| `app/sitemap.ts` | `app/sitemap.ts` | `revalidate` → `"use cache"` (ver §3) |
| `app/sitemap-index/route.ts` | `app/sitemap-index/route.ts` | Nada |
| `next.config.ts` › `rewrites.beforeFiles` | `next.config.ts` | Nada |
| `app/robots.ts` | `app/robots.ts` | + bloqueo fuera de producción (D6) |
| `modules/sitemap/types.ts` | `lib/sitemap/types.ts` | Familias: `models`, `authors`, `compare` |
| `modules/sitemap/lib.ts` | `lib/sitemap/lib.ts` | `sitemapUrls()` con prefijo `/en` (ver §3) |
| `modules/sitemap/data.ts` (`STATIC_ROUTES`) | `lib/sitemap/data.ts` | Las rutas de cheaptokens |
| `common/lib/sitemap.ts` (`sitemapIds`, `sitemapEntries`, `leadingEntries`) | `lib/sitemap/index.ts` | Lee el catálogo del repo, no una base de datos |
| `modules/blog/sitemap.ts` | `lib/blog/sitemap.ts` | Prisma → Drizzle (ver §3 y §8.2) |
| `common/lib/seo.ts` (`SITE_URL`, `SITEMAP_CHUNK_SIZE`, `pageMetadata`, `languageAlternates`) | `lib/seo.ts` | Sin tarjeta OG |
| `common/lib/sitemap.test.ts`, `modules/blog/sitemap.test.ts` | `lib/sitemap/*.test.ts`, `lib/blog/sitemap.test.ts` | Los mismos casos, con las familias nuevas |

## 3. Adaptaciones obligadas

No son elecciones: lo literal no compila o no funciona aquí.

- **`cacheComponents: true`.** Con Cache Components no existe `export const revalidate` (`node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`). Los 300 s de Deska pasan a `"use cache"` con `cacheLife` de 300 s en `sitemapIds()` y `sitemapEntries()`. Se mantiene la regla: un error de lectura se lanza, nunca se cachea un sitemap incompleto.
- **Drizzle, no Prisma** (ADR-0006, ADR-0032). Las consultas del blog se traducen; los filtros y el orden son los mismos.
- **Inglés con prefijo.** Deska sirve el inglés sin prefijo (`/pricing`) y el español en `/es/pricing`. Aquí los dos llevan prefijo (`/en/…`, `/es/…`, ADR-0015). `sitemapUrls()` y `languageAlternates()` generan `/en{path}` y `/es{path}`, y `x-default` → `/en{path}`. Ver §8.1.
- **`/sitemap-index` pasa por el proxy.** No tiene punto, así que `src/proxy.ts` lo redirigiría a `/en/sitemap-index`. Se agrega al matcher como excepción. `/sitemap.xml`, `/sitemap/N.xml` y `/robots.txt` ya pasan, porque el matcher excluye rutas con punto.
- **Sin `englishOnly` por ahora.** Deska lo usa para el texto de terceros (skills de GitHub). Aquí todo está traducido: los 89 modelos tienen descripción en español. El campo se conserva en el tipo, como en Deska.

## 4. Ids y familias

| Id | Contenido | Registros por trozo |
|---|---|---|
| `0`, `1`, `2`… | Blog. El `0` existe siempre y además lleva lo fijo: páginas fijas, `/docs`, tags con modelos | 1.000 filas de idioma |
| `models-N` | Un modelo visible | 1.000 modelos → hasta 2.000 URLs |
| `authors-N` | Un autor con al menos un modelo visible | 1.000 autores |
| `compare-N` | Un par de modelos (§8.3) | 1.000 pares |

`parseSitemapId()` acepta `^(?:(models|authors|compare)-)?(0|[1-9]\d*)$`, igual que en Deska. Un id desconocido, mal formado o vacío da 404.

Hoy son 89 modelos, 12 autores y 254 pares: un trozo de cada familia.

## 5. Páginas nuevas

| Página | Ruta | Regla, como en Deska |
|---|---|---|
| Autor | `/models/[author]` | Existe si el autor tiene un modelo visible (makers: todo dueño con una skill publicada). La ruta ya aparece en la URL de cada modelo y hoy da 404 |
| Tag | `/models/tags/[tag]` | Con modelos: se indexa. Sin modelos: `noindex` y fuera del sitemap (categorías de Deska). Hoy `open-weights` tiene 0 |
| Comparación | `/models/compare/[a]-vs-[b]` | Un orden canónico (por id); el orden inverso redirige al canónico. Precio, descuento, contexto y costo de un request lado a lado |

`tags` y `compare` son segmentos fijos y le ganan a `[author]`. Una prueba falla si algún autor se llama `tags` o `compare`, si un slug se repite entre autores o si un slug contiene `-vs-`.

Los textos salen de los diccionarios (`en` y `es`), y los componentes nuevos se agregan a `/design-system`.

## 6. Metadata

`pageMetadata({ title, description, path, locale, noindex })`, copiado de Deska sin la tarjeta OG:

- canónica = la URL del idioma servido;
- `alternates.languages` = `{ en, es, x-default }` con `languageAlternates(path)`, la misma función que usa el sitemap;
- `metadataBase = SITE_URL` en el layout.

Todas las páginas públicas pasan a usarla y el layout deja de declarar `/en` y `/es` como alternativas.

## 7. Paquetes de trabajo

1. **Base:** `lib/seo.ts`, `pageMetadata` en las 4 páginas actuales, `metadataBase`, `robots.ts`.
2. **Sitemap:** tipos, `parseSitemapId`, `familySitemapIds`, `sitemapUrls`, `STATIC_ROUTES`, `sitemap.ts`, el índice, la regla en `next.config.ts` y la excepción del proxy. Familia `models`.
3. **Autores:** la página y la familia `authors`.
4. **Tags:** la página y su entrada en el trozo 0.
5. **Comparaciones:** la página y la familia `compare`.
6. **Blog:** según §8.2.
7. **ADR-0048** con las decisiones finales, y este plan marcado como implementado.

Cada paquete termina con `pnpm check`; los que tocan pantallas, también con `pnpm test:e2e`. Al final, la receta de Deska (`seo-playbook.md` §11): `curl /sitemap.xml`, cada trozo con `<url>`, `/es/...` con 200 y canónica propia.

## 8. Pendiente de confirmar

**8.1 ¿El inglés pierde el prefijo, como en Deska?** (a) Se queda `/en/…` y solo se adapta `sitemapUrls()`; (b) inglés sin prefijo (`/models`) y español en `/es/models`, que es un ADR que reemplaza parte de ADR-0015 y cambia el proxy. *Default: (a).*

**8.2 ¿Qué parte del blog entra en este plan?** (a) La tabla `blog_posts` en Drizzle con las columnas del `BlogPost` de Deska, más su sitemap con las pruebas de Deska, sin páginas; (b) el blog completo copiado de Deska (tabla, `/blog`, `/blog/[slug]` y script de curación); (c) solo el hueco: `blogSitemapCount()` devuelve 0 hasta que exista la tabla. *Default: (a).*

**8.3 ¿Qué pares se comparan?** (a) Los 254 pares de `similarModels()`, los modelos que comparten más tags, todos indexados; (b) los 3.916 pares posibles, todos indexados (unas 7.800 URLs, casi iguales entre sí); (c) todos los pares existen como página, pero solo se indexa una lista elegida a mano (como los MCP de Deska). *Default: (a).*

## 9. Alternativas descartadas

- **Un solo `sitemap.ts` sin trozos:** era suficiente para ~180 URLs, pero el usuario quiere la forma de Deska para el blog.
- **Ids con nombre para el blog (`blog-N`):** el usuario pidió los ids de Deska tal cual.
- **Indexar solo los modelos con contenido propio, como los MCP de Deska:** hoy dejaría fuera a los 89 (ninguno tiene precio verificado ni descripción escrita a mano).
- **Redirigir los `retired` al sucesor:** el catálogo no registra un sucesor.
