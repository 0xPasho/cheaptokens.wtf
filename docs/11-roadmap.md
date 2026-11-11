# 11 · Roadmap

## Fase 0 · Fundaciones

Objetivo: la base sobre la que todo lo demás se apoya.

- [x] Drizzle: esquema completo de [09 · Modelo de datos](./09-modelo-de-datos.md) y migraciones, con PGlite en local ([ADR-0032](./adr/0032-postgres-node-postgres-y-pglite.md)). Neon se conecta con el deploy.
- [x] i18n: mover la app a `src/app/[lang]/`, diccionarios `en`/`es` y `proxy.ts` con redirección de idioma ([10 · i18n](./10-i18n.md)).
- [ ] Clerk: login y registro localizados, `clerkMiddleware` en `proxy.ts`, verificación con `auth()` en las páginas privadas y creación perezosa del workspace.
- [x] Catálogo: `catalog/models.ts`, `catalog/upstreams.ts`, `pnpm catalog:sync` con validación de margen y tags calculados.
- [x] Página pública `/[lang]/models` con filtros por tag ([14 · Plan](./14-plan-landing-y-catalogo.md)).
- [ ] Key de InferHub solo para cheaptokens.wtf y catálogo de pruebas con 3–5 modelos ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)). El plan del gateway está en [15 · Plan](./15-plan-gateway.md).
- [x] Upstream simulado (`scripts/mock-upstream.ts`) para los tests automáticos y para probar el fallback ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)).
- [ ] Registrar `cheaptokens.wtf` y configurar `cheaptokens.wtf` y `api.cheaptokens.wtf` en Vercel, con el header HSTS en la web ([ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)).

## Fase 1 · MVP (lanzamiento)

Objetivo: un desconocido se registra, recarga, crea una key y hace su primer request en menos de 3 minutos.

**Gateway**

- [x] `POST /v1/chat/completions` con y sin streaming, passthrough de parámetros, `include_usage` forzado, whitelist de campos y reescritura de `id`/`model`.
- [x] Autenticación por API key con validación local y lookup por hash.
- [x] Selección de upstream por prioridad y fallback antes del primer byte.
- [x] Cobro en `after()` en una transacción. Drenar el stream si el cliente se desconecta.
- [ ] Rate limit por workspace (Upstash). Hoy hay un rate limiter en memoria, por instancia: alcanza para desarrollo y pruebas.
- [x] `GET /v1/models` público y cacheado.
- [x] Errores con formato OpenAI y `x-request-id`.

**Web**

- [x] Landing (`/[lang]`), catálogo (`/[lang]/models`) y detalle de modelo (`/[lang]/models/[author]/[model]`), con datos de ejemplo. El detalle se adelantó de la fase 2 a pedido del dueño del producto ([14 · Plan](./14-plan-landing-y-catalogo.md)).
- [ ] Dashboard: inicio con checklist, keys, créditos y uso.
- [x] `/docs` con quickstart.
- [ ] Términos (intermediario y uso aceptable trasladado) y aviso de privacidad, validados por un abogado mexicano ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)).

**Pagos y operación**

- [ ] Aprobación por escrito del MoR (Polar o Paddle) **antes** de integrar ([ADR-0019](./adr/0019-merchant-of-record.md)).
- [ ] `PaymentProvider` con el adaptador del MoR + webhook idempotente.
- [ ] Webhooks de disputa y reembolso. Suspensión de workspace.
- [ ] Webhook `user.deleted` de Clerk.
- [ ] Cron diario de reconciliación de saldos.
- [ ] Al menos 2 upstreams de producción que pasen la [lista de requisitos](./07-upstreams.md#requisitos-para-aceptar-un-upstream). Durante las pruebas: InferHub + simulado.

### Criterios de lanzamiento

- [ ] El SDK oficial de OpenAI (Python y JS) funciona cambiando solo `base_url` y `api_key`, con y sin streaming, incluyendo tools.
- [ ] La reconciliación da 0 de diferencia después de una prueba de carga con requests concurrentes y cancelaciones.
- [ ] Revocar una key hace fallar el request siguiente.
- [ ] Apagar un upstream con `ops_disabled_at` mueve el tráfico al siguiente en ≤ 60 s.
- [ ] Ninguna respuesta, header ni error revela el upstream. Hay un test automatizado que busca su nombre y dominio en las respuestas.
- [ ] Ningún log contiene keys, prompts ni respuestas.
- [ ] Las páginas web funcionan en `en` y `es`, y `pnpm check` pasa.
- [ ] Las [preguntas abiertas](./12-preguntas-abiertas.md) bloqueantes están resueltas: upstreams, aprobación del MoR, validación legal y fiscal, y el registro del dominio.

## Fase 2 · Crecer el uso

- `/v1/messages` compatible con Anthropic, para Claude Code y el SDK de Anthropic.
- Precio de input cacheado por modelo.
- `GET /v1/credits` (saldo vía API).
- Gráficas de uso y tabla de resumen diario.
- Circuit breaker por upstream y health checks automáticos.
- Monitoreo automático del saldo con cada upstream.
- Pruebas periódicas de fidelidad de los upstreams.
- Panel de admin para el catálogo (rol admin en Clerk).
- Rotación de keys con período de gracia y keys restringidas por modelo.
- Recarga automática con tarjeta guardada.
- Alertas: tasa de error por upstream, saldo con upstream y diferencias de reconciliación.

## Fase 3 · Escala

- Organizaciones con saldo compartido y miembros (Clerk Organizations) ([ADR-0016](./adr/0016-workspace-dueno.md)).
- Responses API de OpenAI y embeddings.
- Más idiomas (pt, fr, de…).
- Programa de secret scanning de GitHub para las keys `wtf_`.
- Mover el gateway a Cloudflare Workers si se cumplen los disparadores de [03 · Arquitectura](./03-arquitectura.md#límites-conocidos-de-la-plataforma).
- Restricción de keys por IP.
- Métodos de pago locales (vouchers, transferencias).
