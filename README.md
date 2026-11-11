# cheaptokens.wtf

Next.js 16 (App Router) con TypeScript, Tailwind CSS v4 y shadcn/ui (`base-nova` sobre Base UI).

## Scripts

```bash
pnpm dev        # servidor de desarrollo en http://localhost:3000
pnpm build      # build de producción
pnpm lint       # ESLint
pnpm typecheck  # genera los tipos de rutas y corre tsc
pnpm test       # pruebas unitarias y de componentes (Vitest)
pnpm test:e2e   # build + pruebas en Chrome: axe y capturas por sección (Playwright)
pnpm check      # lint + typecheck + pruebas unitarias + build
```

## Componentes

```bash
pnpm dlx shadcn@latest add <componente>
```

Los átomos instalados están en `src/components/ui/` y se pueden ver en [`/design-system`](http://localhost:3000/design-system).

Las convenciones del proyecto están en [`AGENTS.md`](./AGENTS.md).

## Documentación

Qué es cheaptokens.wtf, cómo funciona y por qué se decidió cada cosa: [`docs/`](./docs/README.md). Las decisiones de arquitectura están en [`docs/adr/`](./docs/adr/README.md).
