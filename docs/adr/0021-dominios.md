# ADR-0021: Web en `deskarouter.dev` y API en `api.deskarouter.dev` (dominio temporal)

- **Estado:** Reemplazada por [ADR-0026](./0026-marca-cheaptokens-wtf.md) el 2026-11-10: se eligieron el nombre y el dominio definitivos.
- **Fecha:** 2026-11-08
- **Origen:** Usuario (dominio) + Default (subdominio para la API)

## Contexto

- El dominio definitivo no está decidido, y la base URL termina escrita en el código de cada cliente.
- [ADR-0005](./0005-gateway-en-nextjs-vercel.md) prevé que el gateway pueda mudarse a otra plataforma (Cloudflare Workers) sin que los clientes cambien nada.

## Decisión

- **Web:** `https://deskarouter.dev` (con `/en/…` y `/es/…`).
- **API:** `https://api.deskarouter.dev/v1`.
- Por ahora los dos hosts apuntan al mismo proyecto de Vercel:
  - El gateway **solo acepta requests en el host de la API** (lista en la env var `API_HOSTS`, más los hosts de preview y `localhost` en desarrollo). En el host web, `/v1/*` responde `404` con un mensaje que indica el host correcto.
  - El `proxy.ts` (i18n + Clerk) solo actúa en el host web.
- **La API no habilita CORS en el MVP:** una API key en el navegador es una key filtrada.
- **El dominio definitivo se fija antes del lanzamiento público.** Si cambia después, el host viejo de la API **se queda como alias permanente que sigue sirviendo tráfico, sin redirigir**: muchos clientes HTTP no repiten un `POST` tras un redirect, o descartan el header `Authorization` cuando el redirect va a otro host.

## Consecuencias

- Mover el gateway a otra plataforma es un cambio de DNS en `api.`, sin que el cliente se entere.
- Las cookies de la web nunca viajan a la API.
- Hay dos dominios que configurar en Vercel y en Clerk (Clerk solo en el host web).
- `.dev` obliga a usar HTTPS (HSTS precargado). No hay que hacer nada, pero tampoco se puede probar con HTTP plano en ese dominio.

## Alternativas descartadas

- **La API en el mismo dominio (`deskarouter.dev/v1`):** mover el gateway obligaría a enrutar por path en el edge en lugar de cambiar un DNS.
- **Redirigir si cambia el dominio:** rompe a los clientes que no siguen redirects en `POST` o que descartan `Authorization`.
