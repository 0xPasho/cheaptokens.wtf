# cheaptokens.wtf

Next.js 16 (App Router) con TypeScript, Tailwind CSS v4 y shadcn/ui (`base-nova` sobre Base UI). El gateway (`/v1/*`) vive en la misma app ([ADR-0005](./docs/adr/0005-gateway-en-nextjs-vercel.md)).

## Scripts

```bash
pnpm dev           # servidor de desarrollo en http://localhost:3000
pnpm build         # build de producción
pnpm lint          # ESLint
pnpm typecheck     # genera los tipos de rutas y corre tsc
pnpm test          # pruebas unitarias y de componentes (Vitest)
pnpm test:gateway  # pruebas de punta a punta del gateway: handler real, PGlite y el upstream simulado
pnpm test:e2e      # build + pruebas en Chrome: axe y capturas por sección (Playwright)
pnpm test:live     # prueba en vivo contra InferHub; solo con INFERHUB_LIVE=1 y la key (gasta dinero real)
pnpm check         # lint + typecheck + pruebas unitarias + pruebas del gateway + build
```

## El gateway en local

Sin cuentas ni Docker: la base es PGlite y el upstream es el simulado ([ADR-0032](./docs/adr/0032-postgres-node-postgres-y-pglite.md)).

```bash
cp .env.example .env.local     # los valores de ejemplo ya funcionan en local

pnpm db:dev                    # terminal 1: Postgres local (PGlite) en 127.0.0.1:5433, datos en .pglite/
pnpm mock:upstream             # terminal 2: upstream simulado en 127.0.0.1:4010

pnpm catalog:sync              # carga catalog/ en la base (db:dev ya aplicó las migraciones)
pnpm keys:create -- --workspace demo            # imprime la key wtf_ una sola vez
export CHEAPTOKENS_API_KEY=wtf_...              # la key que imprimió el paso anterior
pnpm credits:grant -- --workspace demo --usd 5 --note "prueba local"
pnpm dev                       # terminal 3
```

`catalog:sync` avisa que no revalidó el catálogo si `INTERNAL_REVALIDATE_SECRET` está vacío. En local es normal. Contra una base que no levantó `db:dev` (Neon), corre antes `pnpm db:migrate`.

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $CHEAPTOKENS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen/qwen3.8-flash", "messages": [{"role": "user", "content": "Hola"}]}'

pnpm reconcile                 # saldo y gasto de cada key contra los requests, y gasto por upstream
```

- **Contra InferHub de verdad:** pon `UPSTREAM_INFERHUB_API_KEY` en `.env.local`. InferHub pasa a ser el upstream de prioridad 1 y el mock queda de fallback ([ADR-0028](./docs/adr/0028-inferhub-upstream-de-pruebas.md)).
- **Escenarios del mock:** un campo `x_mock` en el body elige el escenario (`{"x_mock": {"scenario": "error-500"}}`, `cut`, `no-usage`, `hang`…). La lista está en `tests/helpers/mock-upstream.ts`.
- **Interruptor de emergencia:** poner `ops_disabled_at` en `model_upstreams` saca ese upstream en 60 s o menos, y `catalog:sync` no lo revierte ([docs/06](./docs/06-catalogo-y-precios.md#fuente-de-verdad-y-sincronización)).

## Componentes

```bash
pnpm dlx shadcn@latest add <componente>
```

Los átomos instalados están en `src/components/ui/` y se pueden ver en [`/design-system`](http://localhost:3000/design-system).

Las convenciones del proyecto están en [`AGENTS.md`](./AGENTS.md).

## Documentación

Qué es cheaptokens.wtf, cómo funciona y por qué se decidió cada cosa: [`docs/`](./docs/README.md). Las decisiones de arquitectura están en [`docs/adr/`](./docs/adr/README.md). El plan con el que se construyó el gateway está en [`docs/15-plan-gateway.md`](./docs/15-plan-gateway.md).
