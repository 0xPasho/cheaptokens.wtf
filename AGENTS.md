<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Convenciones del proyecto

- **Stack:** Next.js (App Router, `src/`), TypeScript estricto, Tailwind CSS v4 y shadcn/ui (estilo `base-nova` sobre Base UI). El gestor de paquetes es pnpm.
- **Componentes UI:** se agregan con `pnpm dlx shadcn@latest add <componente>`. Viven en `src/components/ui/`. No escribas a mano un componente que shadcn ya tiene.
- **Base UI, no Radix:** la composición usa la prop `render` (`<DialogTrigger render={<Button />}>`), no `asChild`. Para un link con apariencia de botón usa `buttonVariants()` sobre `<Link>` (`<Link href="/" className={buttonVariants()}>`): `render` + `nativeButton={false}` le pone `role="button"` al link.
- **Estructura:** `src/components/ui/` para los átomos de shadcn, `src/components/` para los componentes reutilizables de la app (y sus subcarpetas `site/` y `catalog/` para los de página), `src/lib/` para utilidades, `src/hooks/` para hooks.
- **Rutas e idioma:** toda la web vive en `src/app/[lang]/`; las páginas públicas, en el grupo `(site)`. El texto sale de `src/lib/i18n/dictionaries/` (`en` define las claves; `es` tiene que tener las mismas). Desde un Server Component usa `getLocaleAndDictionary()` de `@/lib/i18n/server`.
- **Catálogo:** `catalog/models.ts` (alias `@catalog/*`) exporta la instantánea oficial generada en `catalog/generated/` mediante `pnpm catalog:refresh`; las consultas y el precio derivado están en `@/lib/catalog`. `CATALOG_IS_SAMPLE` es false. Los modelos y mapeos se persisten con `pnpm catalog:sync`. Ver ADR-0046.
- **Clases:** combínalas con `cn` (desde `@/lib/utils` o `cn`).
- **Colores:** usa solo tokens semánticos (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`…). Se definen en `src/app/globals.css` para `:root` y `.dark`. No uses colores crudos de Tailwind (`zinc-500`, `#fff`). `success`, `warning` y `destructive` tienen un solo significado cada uno: ver `docs/13-sistema-de-diseno.md`.
- **Diseño:** las reglas visuales están en `docs/13-sistema-de-diseno.md`. Antes de armar una pantalla, usa los componentes de producto de `src/components/` (`Container`, `PageHeader`, `Price`, `PriceComparison`, `DiscountBadge`, `ModelTagBadge`, `QuickstartSnippet`…) en vez de rearmarlos.
- **Material:** estilo NibbleRouter (ADR-0036). Contenido, controles, menús y diálogos opacos, sin halos ni sombras ornamentales. Las utilidades `glass-*` son aliases planos de compatibilidad. Solo la cabecera conserva el blur de la referencia. Composición en `src/app/nibblerouter.css`, colores mediante tokens en `globals.css`.
- **Formatos:** dinero, porcentajes, tokens y fechas se formatean con `@/lib/format` y el idioma de la ruta. El dinero viaja en µUSD hasta mostrarse. Nunca uses `toFixed()` ni `"$" + n`.
- **Fuentes:** Inter Variable y JetBrains Mono locales desde `src/app/fonts/`, cargadas con `next/font/local` en `layout.tsx` como `--font-inter` y `--font-jetbrains`. `globals.css` las expone como `font-sans`, `font-mono` y `font-heading`. Ver ADR-0036.
- **Referencia viva:** `/design-system` muestra los tokens, los componentes de producto y todos los átomos instalados. Cuando agregues un átomo o un componente de producto, agrégalo también ahí.
- **Verificación:** antes de dar algo por terminado, corre `pnpm check` (lint + typecheck + pruebas unitarias + build). Si cambiaste algo visual, corre también `pnpm test:e2e` (axe y capturas de cada sección de `/design-system` en claro y oscuro). Si el cambio visual es intencional, regenera las capturas con `pnpm test:e2e:update` y revísalas. Detalle en `docs/13-sistema-de-diseno.md › Pruebas`.
- **Producto y decisiones:** `docs/` describe el producto y el diseño, y `docs/adr/` registra las decisiones. Léelos antes de implementar algo del dominio (gateway, API keys, cobro, catálogo, i18n). Si cambias una decisión, escribe un ADR nuevo que reemplace al anterior: no edites el viejo.
