# 17 · Puerta de socios

> **Estado (2026-11-16): construida, sin producción.** Las decisiones de abajo son defaults: nadie las objetó todavía. Falta lo de [Antes de producción](#antes-de-producción).

## Qué es

Una API de servidor a servidor en `/partner/v1` para que un socio abra **un plan por asiento** y le dé a cada persona una key. El primer socio es Deska: abre un plan por cada asiento de un equipo y sus corridas llaman a `/v1/chat/completions` con esa key. El contrato lo escribió Deska (`docs/token-service-partner-contract.md` en su repo) y su cliente es `deska-web/src/common/lib/token-plans/partner-http.ts`. Esta puerta lo sirve tal cual.

No es un sistema aparte. Se monta sobre el cobro de [ADR-0049](./adr/0049-suscripcion-con-limites.md):

- **Un plan de socio es un workspace propio** con una fila en `subscriptions`. `clerk_user_id` es `partner:<socio>:<plan>`, como los `dev:` de [ADR-0050](./adr/0050-login-clerk-y-modo-desarrollo.md), así que nunca entra al dashboard. `payment_provider` es `partner:<socio>`: lo paga el socio.
- **Una key de socio es una key normal** del workspace (`createApiKey`), con `billing_source`, `allowed_models` y `expires_at` ([05 · API keys](./05-api-keys.md#fuente-de-cobro-y-modelos)).
- **El gateway casi no cambia.** Autentica, limita, admite y cobra esas keys como cualquier otra, con los mismos headers `x-usage-*` y el mismo `429 usage_limit_reached`. Solo hay tres puntos nuevos: `activePlan` (`src/lib/billing/state.ts`) también conoce los planes de socio, la admisión (`admitUsage`) trata el excedente de un plan de socio como pospago (ver [Excedente](#excedente-pospago)), y el handler cuenta las corridas de `x-deska-run` (ver [Corridas](#corridas)).

Código: `src/lib/partner/` (reglas y HTTP) y `src/app/partner/v1/` (route handlers que solo llaman a `src/lib/partner/http.ts`, como el gateway con [ADR-0033](./adr/0033-gateway-con-dependencias-inyectadas.md)). El proxy deja fuera `/partner/` para no redirigirla a un idioma.

## Rutas

Base: `https://<host>/partner/v1`. JSON en los dos sentidos, dinero en µUSD enteros y fechas en ISO 8601. Toda respuesta lleva `cache-control: no-store`.

| Método y ruta | Body | Respuesta | Qué hace |
|---|---|---|---|
| `POST /plans` | `{ externalRef, tier, paidThrough }` | `200` Plan | Abre un plan con el excedente apagado. Si ya hay uno **abierto** con ese `externalRef`, lo contesta otra vez |
| `PATCH /plans/{planId}` | `{ tier?, paidThrough? }` | `200` Plan | El plan nuevo aplica desde el siguiente request, al subir y al bajar. Lo usado cuenta sobre el límite nuevo |
| `POST /plans/{planId}/close` | `{}` | `204` | Cierra el plan y revoca todas sus keys en la misma transacción. Idempotente |
| `POST /plans/{planId}/keys` | `{ expiresAt }` | `200` Key | La única respuesta con una key en claro. `expires_at` = `expiresAt` |
| `POST /keys/{keyId}/revoke` | `{}` | `204` | Revoca al instante, sin las 24 horas de gracia de una rotación. Idempotente |
| `GET /plans/{planId}/usage?month=YYYY-MM` | | `200` Uso | Lo que queda de la ventana y la semana (0 a 1, siempre las actuales) y, del mes UTC pedido (el actual si falta `month`): el excedente con su tope, el uso, los requests y las corridas. Un `month` mal formado es `400`. Tres queries por índice |
| `PUT /plans/{planId}/extra-cap` | `{ capMicroUsd: number \| null }` | `204` | Número: excedente hasta ese tope en el mes UTC, cobrado al socio. `null`: apagado |

Los IDs públicos llevan prefijo, como `req_…`: `plan_<uuid sin guiones>` y `key_<uuid sin guiones>`. Un ID que no tiene la forma responde `404`, igual que uno que no existe o que es de otro socio.

Una key revocada o de un plan cerrado responde `401 invalid_api_key` en el request siguiente: el gateway no cachea keys ([05 › Revocar](./05-api-keys.md#revocar)).

## Uso por mes

- **`month`** es un mes UTC (`2026-11`). Sin él, el actual. Uno futuro o sin uso responde ceros.
- **`monthMicroUsd` y `requestsThisMonth`** suman `requests` del mes, de todas las fuentes y con los fallidos.
- **`extra.spentMicroUsd`:** en el mes actual, el contador con el que el gateway aplica el tope (`overflow_spent_micro_usd`); en uno pasado, `Σ requests.credits_micro_usd` del mes, que en un plan de socio solo paga el excedente.
- **`extra.capMicroUsd`:** en el mes actual, el del workspace; en uno pasado, el que se puso ese mes o, si no se cambió, el último anterior (`partner_plan_caps`). Sin ninguno, `null`: el excedente empieza apagado.
- **`runsThisMonth`:** las corridas distintas del mes ([Corridas](#corridas)).
- **Un plan cerrado se sigue leyendo:** nada de lo que alimenta los meses pasados (`requests`, `partner_runs`, `partner_plan_caps`) se borra. El contrato pide al menos 13 meses.

## Corridas

El forwarder de Deska manda en cada llamada a `/v1/chat/completions` el header `x-deska-run`: un digest opaco de 32 hex, uno por corrida de Deska Harness, nunca un nombre ni un prompt.

- Después de admitir el request y llamar al upstream (los mismos requests que se registran), el handler agenda en `after()` una sola sentencia (`countRun` en `src/lib/partner/runs.ts`): inserta `(plan, mes, digest)` en `partner_runs` si el workspace es de un plan de socio, y no hace nada si ya estaba.
- `runsThisMonth` cuenta las filas del plan en el mes. Una corrida que cruza el fin de mes cuenta en los dos.
- Sin el header, o con algo que no sean 32 hex, no se cuenta nada. Las keys que no son de un socio nunca guardan corridas.
- El digest no se loguea y no llega al upstream: el gateway no reenvía headers del cliente.

## Autenticación

`Authorization: Bearer <secreto>`. Cada socio tiene su secreto en una variable de entorno (`PARTNERS` en `src/lib/partner/auth.ts`); el de Deska es `PARTNER_DESKA_SECRET`. Se compara por hash en tiempo constante. Sin la variable, o con menos de 32 caracteres, la puerta le responde `401` a ese socio.

## Idempotencia

Cada escritura exige `Idempotency-Key` (hasta 255 caracteres imprimibles). La misma key con el mismo método, ruta y body contesta lo mismo; con otro body, `422 idempotency_key_reused`.

- **Todo pasa en una transacción** (`src/lib/partner/idempotency.ts`). La fila de la key se inserta primero, así que un reintento simultáneo espera al primero y después lee su respuesta. Si la operación falla, se deshace y la key queda libre: solo se guardan respuestas 2xx.
- **Las respuestas se guardan cifradas** (AES-256-GCM, con una clave derivada del secreto del socio) y se borran a las 24 horas. La de `POST /keys` lleva la key: es la única forma de contestarle la misma key a un reintento sin emitir otra.
- **Abrir un plan es la excepción:** su idempotencia es por `externalRef`, como dice el contrato. Deska manda `open:<externalRef>` como key durante toda la vida del asiento, con otro `paidThrough` en cada apertura. Si se guardara la respuesta, reabrir un asiento después de cerrarlo contestaría el plan cerrado o un `422`.

## Planes de socio

Funcionan como los planes públicos, con la ventana y la semana en valor de uso a precio cheaptokens.wtf (`src/lib/partner/tiers.ts`), pero no se venden en el sitio.

| Plan | Precio al mes | Ventana de 5 horas | Semana | Requests por minuto |
|---|---|---|---|---|
| `plan-9` | $9 | $1.26 | $5.40 | 60 |
| `plan-49` | $49 | $6.86 | $29.40 | 120 |
| `plan-99` | $99 | $13.86 | $59.40 | 200 |

La semana es el 60 % del precio, como en Plus, Pro y Max; la ventana, el 14 % (la proporción de Pro). Así un asiento usado al máximo tiene el mismo margen que un plan público, con el mismo riesgo: **hay que calibrarlos** antes de lanzar ([ADR-0049 › Margen](./adr/0049-suscripcion-con-limites.md#margen)).

Los modelos de un plan son los del catálogo público (`active` y `deprecated`), los mismos en los tres planes. Una key los recibe en `allowed_models` al emitirse, y las keys vivas los vuelven a recibir en cada `PATCH`, que es cuando el socio también refresca su lista.

## Excedente pospago

- **Apagado** (el default y `capMicroUsd: null`): el workspace queda en `overflow_mode = stop` y sus keys en `plan_only`. Al llegar al límite, `429 usage_limit_reached` con `retry-after`.
- **Con tope:** `overflow_mode = continue`, solo créditos (sin paquetes), `overflow_cap_micro_usd` = el tope, y las keys pasan a `plan_then_prepaid`. El tope mensual y su gasto son los de ADR-0049, por mes UTC.
- **Lo paga el socio a mes vencido.** La admisión de ADR-0049 pide saldo positivo para usar créditos. A un plan de socio abierto se le admite con lo que le queda del tope (`src/lib/partner/postpaid.ts`, una query solo cuando el plan se agotó). El cobro no cambia: `splitCharge` ya acota el excedente con el tope, y el saldo del workspace baja de cero. **Ese negativo es lo que debe el socio**, y la conciliación sigue cuadrando.
- Un tope menor que lo gastado en el mes queda alcanzado.

## Errores

`{ "error": { "code", "message" } }` con mensajes fijos en inglés: nunca llevan una key, un dato del request ni el nombre de un upstream. El socio solo lee el status.

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `invalid_request` | Body inválido, falta `Idempotency-Key` o `expiresAt` fuera de rango |
| 401 | `unauthorized` | Sin secreto, secreto incorrecto o socio sin configurar |
| 404 | `not_found` | Plan o key inexistente, de otro socio o con un ID mal formado |
| 409 | `conflict` | El plan está cerrado, el plan ya tiene 25 keys vivas, o la respuesta guardada de esa `Idempotency-Key` no se puede leer |
| 413 | `request_too_large` | Body de más de 16 KB |
| 422 | `idempotency_key_reused` | La misma `Idempotency-Key` con otro método, ruta o body |
| 500 | `internal_error` | Cualquier otra falla. Se loguea solo el nombre de la ruta |

## Datos

- **`partner_plans`:** `id` (el plan), `partner_id`, `external_ref`, `workspace_id` (único), `paid_through`, `created_at`, `closed_at`. Índice único parcial en `(partner_id, external_ref)` mientras `closed_at` es null: un solo plan abierto por referencia.
- **`partner_idempotency_keys`:** PK `(partner_id, key)`, `fingerprint` (SHA-256 de método, ruta y body), `status`, `body_sealed`, `created_at`.
- **`partner_runs`:** PK `(plan_id, month, run)`. `month` es el primer día del mes UTC; `run`, el digest de `x-deska-run`.
- **`partner_plan_caps`:** PK `(plan_id, month)`, `cap_micro_usd` (null: apagado). Una fila por mes en que el socio cambió el tope; guarda el último del mes.
- Migraciones: `drizzle/0002_youthful_dust.sql` y `drizzle/0003_tidy_mysterio.sql`. El resto vive en las tablas de ADR-0049: `workspaces`, `subscriptions`, `usage_windows`, `api_keys` y `requests`.

## Decisiones

| # | Decisión | Origen | Por qué |
|---|---|---|---|
| D1 | Tres planes de socio nuevos (`plan-9`, `plan-49`, `plan-99`) a $9, $49 y $99, con la semana al 60 % y la ventana al 14 % del precio | Default | El contrato pide esos precios y los públicos son $20, $50 y $150. Mapearlos a Plus, Pro y Max regalaría límites; con la misma proporción el margen es el de ADR-0049 |
| D2 | Un workspace por plan, con su suscripción de `payment_provider = partner:<socio>` | Default | Reusa ventanas, admisión, cobro, headers y conciliación sin tocarlos |
| D3 | La suscripción vale hasta `paidThrough` + 8 días | Default | Son los 7 días de gracia de un pago atrasado y uno más, el mismo margen con el que Deska pide las keys. Si el pago no llega, Deska cierra el plan |
| D4 | Los modelos son el catálogo público (`active` y `deprecated`); los `hidden` no entran | Default | Es lo que el sitio anuncia. `hidden` es para probar antes de anunciar |
| D5 | El excedente es pospago: se admite con el tope que queda y el saldo del asiento puede quedar negativo | Default | El contrato dice que lo paga el socio, no la persona ni un prepago |
| D6 | Abrir un plan es idempotente por `externalRef`, sin guardar la respuesta; el resto de escrituras guarda la respuesta 2xx 24 horas | Default | Deska reusa `open:<externalRef>`. 24 horas es la ventana habitual de reintentos |
| D7 | Las respuestas guardadas van cifradas con una clave derivada del secreto del socio | Default | La de `POST /keys` lleva la key. Rotar el secreto vuelve ilegibles las guardadas: un reintento recibe `409` |
| D8 | `expiresAt` entre ahora y 400 días; tope de excedente hasta $100,000 al mes | Default | Cubre un periodo anual con su margen y el tope máximo de Deska ($5,000) con holgura |
| D9 | El secreto del socio va en una variable por socio (`PARTNER_DESKA_SECRET`), de 32 caracteres o más | Default | Un solo socio hoy; otro socio es una línea en `PARTNERS` |
| D10 | `inferenceBaseUrl` es `https://<API_HOST>/v1`, o el origen del request sin `API_HOST` | Default | En producción la API vive en `api.cheaptokens.wtf` ([ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)); en local, donde corre la app |
| D11 | `requestsThisMonth` cuenta todos los requests del mes, también los fallidos | Default | Es el mismo conjunto que `monthMicroUsd`; los fallidos cuestan 0 |
| D12 | Una corrida cuenta cuando su request se admite y llega al upstream; un `429` o un `401` no la cuentan | Default | Así `runsThisMonth` sale de los mismos requests que `requestsThisMonth`: corridas que usaron el plan |
| D13 | El tope de un mes pasado es el último que el socio puso en ese mes o antes (`partner_plan_caps`) | Default | El contrato devuelve el tope en cada mes y el workspace solo guarda el actual |
| D14 | `partner_runs` y `partner_plan_caps` no se limpian | Default | El contrato pide 13 meses legibles; son una fila por corrida y por cambio de tope al mes. Se poda cuando pese |

## Antes de producción

- **Cobrarle al socio.** Falta el estado de cuenta mensual: los planes del mes (`subscriptions` con `payment_provider = partner:<socio>`, prorrateando altas, bajas y cambios) más el excedente (`Σ requests.credits_micro_usd` de sus workspaces). Y registrar cada pago, que hoy no tiene dónde (`payments` es del MoR). El contrato exige que esto esté vivo antes de producción.
- **Medir `partner_runs`.** Es una escritura más por request de Deska (en `after()`, casi siempre sin efecto). Si pesa, se puede quitar la consulta a `partner_plans` guardando el plan en el contexto de la key.
- **Configurar** `PARTNER_DESKA_SECRET` en el deploy y dárselo a Deska como su `TOKEN_PARTNER_SECRET`, con `TOKEN_PARTNER_URL` apuntando al host que sirve `/partner/v1`.
- **Migrar** la base de producción con `pnpm db:migrate` (las migraciones `0002` y `0003` dependen de la `0001` de ADR-0049).
- **Calibrar** los límites de los tres planes junto con los públicos (D1).
- **Rate limit:** con varias instancias, el limiter en memoria no comparte la cuenta ([ADR-0017](./adr/0017-rate-limit-upstash.md)). Aplica igual a los asientos de socio.
