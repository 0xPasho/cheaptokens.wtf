# ADR-0033: El gateway es una función con dependencias inyectadas

- **Estado:** Aceptada. Concreta el aislamiento de [ADR-0005](./0005-gateway-en-nextjs-vercel.md).
- **Fecha:** 2026-11-10
- **Origen:** Default (propuesto en [15 · Plan](../15-plan-gateway.md) y guardado a pedido del dueño)

## Contexto

- [ADR-0005](./0005-gateway-en-nextjs-vercel.md) pide que `src/lib/gateway/` no importe nada de la web (Clerk, React, i18n), para poder sacarlo a otro runtime.
- El gateway también necesita cosas que vienen de Next o del entorno: `after()` para cobrar después de responder, la base, el rate limiter, el catálogo cacheado, el reloj y el logger. Si las importa directamente, queda atado a Next igual.
- El plan corre el gateway en pruebas contra un upstream simulado, con PGlite y sin levantar Next. Además, varios ejecutores trabajan en paralelo y necesitan un contrato fijo.

## Decisión

- **El gateway es una función:**

  ```ts
  // src/lib/gateway/handler.ts
  export async function handleChatCompletion(req: Request, deps: GatewayDeps): Promise<Response>;

  export interface GatewayDeps {
    db: Db;
    rateLimiter: RateLimiter;
    catalog: CatalogSnapshot;            // modelos + mapeos, cacheado 60 s
    fetch: typeof fetch;
    after: (task: () => Promise<void>) => void;
    now: () => number;
    log: Logger;                         // sin bodies ni Authorization
    env: { isProduction: boolean };
  }
  ```

- **`src/lib/gateway/` no importa `next/*`**, además de lo que ya prohibía ADR-0005 (Clerk, React y diccionarios).
- **El route handler es el adaptador:** arma `GatewayDeps` con `after` de `next/server`, el cliente de base de datos, el rate limiter y el snapshot del catálogo, y llama a la función. No tiene lógica propia.
- **Los contratos (`GatewayDeps` y los tipos de `src/lib/gateway/types.ts`) se fijan en la ola 0 del plan** y solo se cambian a través del planificador ([ADR-0034](./0034-construccion-por-olas.md)).

## Consecuencias

- El gateway completo se prueba con `fetch` apuntando al mock, PGlite y un `after` que guarda las tareas para esperarlas en la prueba.
- Mover el gateway a Cloudflare Workers es escribir otro adaptador: cambian `after` (`waitUntil`), el driver de la base y el rate limiter.
- Hay que pasar las dependencias a mano por las funciones internas. Es más verboso, pero cada dependencia queda a la vista.
- Una regla de lint o una prueba verifica que `src/lib/gateway/` no importe `next/*`, `react`, `@clerk/*` ni `@/lib/i18n`.

## Alternativas descartadas

- **Importar `after` y los clientes directamente en `src/lib/gateway/`:** ata el gateway a Next y obliga a mockear módulos en cada prueba.
- **Singletons globales (un `db` y un `rateLimiter` importables):** cómodos, pero las pruebas en paralelo comparten estado y el contrato queda implícito.
- **Un framework de inyección de dependencias:** una interfaz y un objeto alcanzan.
