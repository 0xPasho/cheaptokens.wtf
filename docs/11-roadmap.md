# 11 · Roadmap

## Fase 0 · Fundaciones

Objetivo: la base sobre la que todo lo demás se apoya.

- [x] Drizzle: esquema completo de [09 · Modelo de datos](./09-modelo-de-datos.md) y migraciones, con PGlite en local ([ADR-0032](./adr/0032-postgres-node-postgres-y-pglite.md)). Neon se conecta con el deploy.
- [x] i18n: mover la app a `src/app/[lang]/`, diccionarios `en`/`es` y `proxy.ts` con redirección de idioma ([10 · i18n](./10-i18n.md)).
- [x] Clerk: login y registro localizados, `clerkMiddleware` en `proxy.ts`, sesión verificada en cada página privada y creación perezosa del workspace. Se activa con las claves de Clerk; sin ellas, en desarrollo se entra con un nombre ([ADR-0050](./adr/0050-login-clerk-y-modo-desarrollo.md)). Entrar y crear cuenta son una sola ventana con código por correo ([ADR-0063](./adr/0063-una-sola-ventana-de-acceso.md)).
- [ ] Instancia de Clerk del dueño: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` en Vercel, y el webhook `user.deleted` registrado con `CLERK_WEBHOOK_SIGNING_SECRET`. Necesita el dominio registrado.
- [x] Catálogo: `catalog/models.ts`, `catalog/upstreams.ts`, `pnpm catalog:sync` con validación de margen y tags calculados.
- [x] Página pública `/[lang]/models` con filtros por tag ([14 · Plan](./14-plan-landing-y-catalogo.md)).
- [ ] Key de InferHub solo para cheapllm.wtf y catálogo de pruebas con 3–5 modelos ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)). El plan del gateway está en [15 · Plan](./15-plan-gateway.md).
- [x] Upstream simulado (`scripts/mock-upstream.ts`) para los tests automáticos y para probar el fallback ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)).
- [ ] Registrar `cheapllm.wtf` y configurar `cheapllm.wtf` y `api.cheapllm.wtf` en Vercel, con el header HSTS en la web ([ADR-0051](./adr/0051-marca-cheapllm-wtf.md)).

## Fase 1 · MVP (lanzamiento)

Objetivo: un desconocido se registra, elige un plan o recarga, crea una key y hace su primer request en menos de 3 minutos.

**Gateway**

- [x] `POST /v1/chat/completions` con y sin streaming, passthrough de parámetros, `include_usage` forzado, whitelist de campos y reescritura de `id`/`model`.
- [x] Autenticación por API key con validación local y lookup por hash.
- [x] Selección de upstream por prioridad y fallback antes del primer byte.
- [x] Cobro en `after()` en una transacción. Drenar el stream si el cliente se desconecta.
- [ ] Rate limit por workspace (Upstash). Hoy hay un rate limiter en memoria, por instancia: alcanza para desarrollo y pruebas.
- [x] `GET /v1/models` público y cacheado.
- [x] Errores con formato OpenAI y `x-request-id`.

**Planes y límites** ([ADR-0049](./adr/0049-suscripcion-con-limites.md))

- [x] Planes Plus, Pro y Max con ventana de 5 horas y semana, medidos en valor de uso a precio cheapllm.wtf.
- [x] Paquetes por modelo (20 % extra, 90 días) y orden de cobro plan → paquete → créditos, con excedente configurable y tope mensual.
- [x] Por key: fuente de cobro, modelos permitidos y rotación con 24 horas de gracia.
- [x] Headers `x-usage-*` y errores `usage_limit_reached`, `no_active_plan` y `model_not_allowed_for_key`.
- [x] Conciliación con el reparto por request y el invariante de paquetes.
- [ ] Calibrar los límites de los planes y los paquetes con el costo upstream de cada modelo ([12 · Preguntas abiertas](./12-preguntas-abiertas.md)).
- [ ] Renovación, cambio de plan programado y `past_due` con los eventos del MoR.

**Web**

- [x] Landing (`/[lang]`), catálogo (`/[lang]/models`) y detalle de modelo (`/[lang]/models/[author]/[model]`), con datos de ejemplo. El detalle se adelantó de la fase 2 a pedido del dueño del producto ([14 · Plan](./14-plan-landing-y-catalogo.md)).
- [x] Dashboard: inicio, plan y límites, créditos, API keys, uso y ajustes ([02 · Producto y UX](./02-producto-y-ux.md#dashboard)). Playground y Combos quedan para después.
- [x] `/docs` con quickstart.
- [ ] Términos (intermediario y uso aceptable trasladado) y aviso de privacidad, validados por un abogado mexicano ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)).

**Pagos y operación**

- [x] Depósitos en USDC sobre Solana y Base: una dirección por cuenta, barrido a la wallet principal y planes pagados con saldo ([ADR-0058](./adr/0058-deposito-por-cuenta-y-saldo.md)).
- [ ] Semilla, wallets principales y RPC en Vercel (`CRYPTO_*`), y fondear las dos wallets de comisiones (`pnpm payments:status`).
- [ ] Un depósito real de punta a punta en cada red, con poco dinero, antes de abrir. Hasta ahora solo hay lecturas y simulaciones contra mainnet.
- [ ] Herramienta para recuperar otro token u otra red enviados a una dirección de depósito, y canal de soporte para pedirlo.
- [ ] Stripe o un MoR como segundo medio de pago ([ADR-0019](./adr/0019-merchant-of-record.md), en pausa).
- [ ] Webhooks de disputa y reembolso. Suspensión de workspace.
- [x] Webhook `user.deleted` de Clerk (`/api/webhooks/clerk`). Falta registrarlo en la instancia (fase 0).
- [ ] Cron diario de reconciliación de saldos.
- [ ] Al menos 2 upstreams de producción que pasen la [lista de requisitos](./07-upstreams.md#requisitos-para-aceptar-un-upstream). Durante las pruebas: InferHub + simulado.

**Revisión del PR #1 · antes de desplegar**

El [PR #1](https://github.com/0xPasho/cheaptokens.wtf/pull/1) trajo las reservas por request ([ADR-0066](./adr/0066-reserva-por-request.md)), el pulido de UI y la landing nueva. Entró sin revisión; esto es lo que la revisión posterior dejó pendiente.

- [x] Probar en vivo contra InferHub tres casos: `max_tokens` mayor que la salida máxima del modelo, prompt + `max_tokens` mayor que el contexto, y un modelo de razonamiento con `max_tokens`. Hecho el 2026-11-21 con `cb/kimi-k2.5`, `cx/gpt-6-luna` y `oai/gpt-5.4-mini`: InferHub respondió `200` en los tres.
- [x] Acotar el `max_tokens` que el gateway manda cuando el cliente no lo fija (32 768). No hizo falta: InferHub acepta un `max_tokens` mayor que la salida máxima y que el contexto libre. Hay que repetir la prueba con cada upstream nuevo; `GET /v1/models` de InferHub ya trae `max_output_tokens` por modelo, por si un vendedor lo rechaza.
- [x] Descontar las reservas en curso antes de decidir que el plan alcanza. Con requests en paralelo, un asiento de socio o un workspace con paquetes salía recortado o con `429` sin que se consultara el tope ni el paquete (`admitUsage` en `src/lib/gateway/authenticate.ts`).
- [x] Sin `max_tokens` del cliente, mandar la salida máxima de cada modelo según InferHub en vez de 32 768 para todos ([ADR-0067](./adr/0067-salida-maxima-por-modelo.md)).
- [x] Liberar la reserva aunque `after()` falle (`afterThenRelease` en `src/lib/gateway/handler.ts`).
- [x] «Cómo funciona», en la cabecera y en el menú móvil, apuntaba a `#how-it-works`, que ya no existe. Ahora lleva a `#why` (`src/components/site/site-header.tsx`).
- [ ] Desplegar `main` en producción ([18 · Deploy](./18-deploy.md)).

**Revisión del PR #1 · cobro**

Lo que cambie una decisión de ADR-0066 va con un ADR nuevo que la reemplace.

- [ ] Avisar con un header de respuesta cuando la salida se recortó por saldo o por plan. Hoy el cliente solo ve `finish_reason: "length"`.
- [ ] Estimar el prompt por tipo de carácter. A 3 bytes por token no es una cota para dígitos, símbolos ni texto no ASCII.
- [ ] `Retry-After` de un `429` por reserva: el reinicio de la ventana que limita, y corto o ausente cuando solo falta que se liberen reservas (`budgetShortfall` en `src/lib/billing/limits.ts`).
- [ ] Contar los requests recortados o rechazados solo por reservas en curso. Con ese dato se decide si hace falta una cola o una tolerancia; mientras tanto la reserva se queda estricta.
- [ ] Asiento de socio con saldo positivo: admitirlo con lo que queda del tope (`admissionBalance` en `src/lib/partner/postpaid.ts`). Solo pasa con un abono manual.

**Revisión del PR #1 · web**

- [ ] Actualizar `tests/e2e/pages.spec.ts` a la landing nueva: todavía busca `#models`, «Calcula las requests con» y el costo del request de ejemplo anterior. Después, regenerar las capturas con `pnpm test:e2e:update` y revisarlas.
- [ ] ADR que reemplace la lista de secciones de [ADR-0060](./adr/0060-landing-explica-el-producto.md) por la landing nueva, y actualizar [02 · Producto y UX](./02-producto-y-ux.md).
- [ ] La tabla de precios de la landing abre en el primer grupo que tenga modelos, no siempre en «popular» (`src/components/site/marketing/price-table.tsx`).
- [ ] El tope de excedente del formulario del plan se formatea con `@/lib/format` (`src/app/[lang]/(site)/dashboard/plan/page.tsx`).
- [ ] Uso: acotar `?page=` antes de la primera consulta (`src/app/[lang]/(site)/dashboard/usage/page.tsx`).
- [ ] Selector de idioma: cambiar también el idioma dentro de `redirect_url` y leer la query vigente (`src/components/site/language-switcher.tsx`).

**Revisión del PR #1 · proceso**

- [ ] CI en cada PR: lint, typecheck, pruebas unitarias, pruebas del gateway y build. Las capturas visuales siguen en local, porque solo existen para macOS y Windows.
- [ ] Proteger `main`: PR con una aprobación y CI en verde, y el dueño como revisor obligatorio de gateway, cobro y ADRs (`CODEOWNERS`).

### Criterios de lanzamiento

- [ ] El SDK oficial de OpenAI (Python y JS) funciona cambiando solo `base_url` y `api_key`, con y sin streaming, incluyendo tools. JS verificado ([15 · Plan › Terminado](./15-plan-gateway.md#6-terminado)); falta probar Python.
- [x] La reconciliación da 0 de diferencia después de una prueba de carga con requests concurrentes y cancelaciones.
- [ ] Ningún plan ni paquete pierde dinero usado al máximo con el costo upstream de sus modelos ([ADR-0049 › Margen](./adr/0049-suscripcion-con-limites.md#margen)).
- [x] Revocar una key hace fallar el request siguiente.
- [x] Apagar un upstream con `ops_disabled_at` mueve el tráfico al siguiente en ≤ 60 s.
- [x] Ninguna respuesta, header ni error revela el upstream. Hay un test automatizado que busca su nombre y dominio en las respuestas.
- [x] Ningún log contiene keys, prompts ni respuestas.
- [x] Las páginas web funcionan en `en` y `es`, y `pnpm check` pasa.
- [ ] Las [preguntas abiertas](./12-preguntas-abiertas.md) bloqueantes están resueltas: upstreams, aprobación del MoR, validación legal y fiscal, el registro del dominio y los límites de los planes.

## Fase 2 · Crecer el uso

- `/v1/messages` compatible con Anthropic, para Claude Code y el SDK de Anthropic.
- Precio de input cacheado por modelo.
- `GET /v1/credits` (saldo vía API).
- Gráficas de uso y tabla de resumen diario.
- Circuit breaker por upstream y health checks automáticos.
- Monitoreo automático del saldo con cada upstream.
- Pruebas periódicas de fidelidad de los upstreams.
- Panel de admin para el catálogo (rol admin en Clerk).
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
