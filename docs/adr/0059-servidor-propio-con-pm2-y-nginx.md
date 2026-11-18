# ADR-0059: La app corre en un servidor propio con pm2 y nginx, detrás de Cloudflare

- **Estado:** Aceptada. Reemplaza el hosting de [ADR-0005](./0005-gateway-en-nextjs-vercel.md): sigue siendo una sola app de Next.js con el gateway aislado, pero ya no corre en Vercel.
- **Fecha:** 2026-11-17
- **Origen:** Usuario

## Contexto

- [ADR-0005](./0005-gateway-en-nextjs-vercel.md) puso la app en Vercel Pro y descartó el servidor propio porque hay que operarlo a mano.
- El dueño ya opera un servidor con sus otros productos (Deska entre ellos): `next start` bajo pm2, nginx delante, Cloudflare como proxy y un Postgres compartido en otra máquina. Sumar una app ahí no cuesta nada extra.
- Deska y cheapllm.wtf se llaman entre sí por la puerta de socios ([docs/17](../17-puerta-de-socios.md)).

## Decisión

- **Una sola app de Next.js con `next start` bajo pm2** (`cheapllm-web`, puerto 3014), en `~/cheapllm.wtf` del servidor. Atiende `cheapllm.wtf` y `api.cheapllm.wtf`.
- **nginx delante**, con un certificado de origen autofirmado. Cloudflare hace de proxy en modo SSL Full. El vhost no hace buffer y espera hasta 900 s, para los streams del gateway.
- **Postgres:** la base `cheapllm` con el rol `cheapllm_app`, en el Postgres compartido del dueño. Reemplaza a Neon de [ADR-0006](./0006-postgres-neon-drizzle.md) como proveedor; Drizzle y node-postgres no cambian.
- **Variables:** `.env.production.local` en el servidor, subido a mano y nunca versionado. Siempre con `APP_ENV=production` ([ADR-0050](./0050-login-clerk-y-modo-desarrollo.md)).
- **Cron:** el crontab del servidor corre `deploy/cron.sh` cada minuto. Llama a `/api/internal/refresh-catalog` y `/api/internal/crypto-payments` con `CRON_SECRET`. `vercel.json` se borra.
- **Deploy manual:** `deploy/deploy.sh` sube el commit `HEAD`, compila en el servidor en un directorio aparte y reinicia. El paso a paso está en [18 · Deploy](../18-deploy.md).
- **El servidor no se nombra en el repo:** el host, el usuario y las credenciales viven en `~/.deska-deploy.env` de la máquina del operador.

## Consecuencias

- Sin límite de 800 s ni de 4.5 MB de Vercel: los fija nginx (900 s, 25 MB). `maxDuration` ya no lo aplica la plataforma.
- **Cloudflare corta a los 100 s sin bytes.** Un stream manda bytes todo el tiempo, pero un request sin stream que tarde más de 100 s recibe un `524`. Hay que vigilarlo con los modelos de razonamiento.
- No hay previews por rama ni rollback de un clic. Para volver atrás queda el build anterior en `.next-prev`.
- El servidor es un punto único de falla y comparte memoria con otras apps. `next build` necesita swap temporal.
- `VERCEL_ENV` ya no existe: sin `APP_ENV=production` la app quedaría en modo de desarrollo, con login y pagos de prueba.
- El rate limit en memoria vale porque hay un solo proceso. Con más de uno hace falta un store compartido.

## Alternativas descartadas

- **Seguir con Vercel Pro:** otro proveedor y otro costo fijo para algo que el servidor actual ya resuelve, con límites de duración y tamaño.
- **Docker o un orquestador:** ninguna otra app del servidor lo usa. Sería una forma más de operar para una sola app.
- **Clonar el repo en el servidor con una deploy key:** otra credencial que cuidar. `git archive` sube exactamente el commit sin darle acceso a GitHub al servidor.
