# ADR-0049: Suscripción con límites de uso, con paquetes y créditos de respaldo

- **Estado:** Aceptada. Reemplaza a [ADR-0008](./0008-creditos-prepagados.md).
- **Fecha:** 2026-11-15
- **Origen:** Usuario

## Contexto

- [ADR-0008](./0008-creditos-prepagados.md) dejó un solo modelo de cobro: créditos prepagados. Descartó la suscripción porque el uso de los LLMs es muy variable y una cuota fija le cobra de más al usuario o nos deja expuestos.
- Quien programa con agentes ya paga así en otros lados: un plan mensual con un límite que se reinicia cada 5 horas y otro cada semana (el esquema de Codex). Un plan le da un gasto fijo; los créditos le obligan a vigilar el saldo.
- La variabilidad que preocupaba a ADR-0008 se contiene con los límites: el plan no es ilimitado, tiene techo por ventana y por semana.
- Los créditos siguen haciendo falta: para quien no quiere plan, para CI y producción, y para seguir después del límite.

## Decisión

### Planes

Tres planes mensuales (`src/lib/billing/plans.ts`):

| Plan | Precio al mes | Ventana de 5 horas | Semana | Requests por minuto |
|---|---|---|---|---|
| Plus | $20 | $2.50 | $12 | 60 |
| Pro | $50 | $7 | $30 | 120 |
| Max | $150 | $22 | $90 | 300 |

- **Los límites se miden en valor de uso a precio cheaptokens.wtf**, en µUSD: cada request gasta del límite lo mismo que costaría en créditos. Un modelo caro gasta el límite más rápido. El dashboard lo explica con un multiplicador frente a Claude Sonnet 5.5 y con requests típicas (20 000 tokens de entrada y 2000 de salida).
- **Son valores iniciales y hay que calibrarlos** (ver [Margen](#margen)). Cambiarlos aplica desde el siguiente request.
- **Ventanas:** cada una empieza con el primer request que cobra del plan y se reinicia al cumplir 5 horas o 7 días. Hay una fila por workspace y tipo en `usage_windows`. Lo que queda del plan es el menor de los dos restos.
- **Rate limit:** el del plan reemplaza al global. El override del workspace (`workspaces.rate_limit_rpm`) manda sobre los dos ([ADR-0017](./0017-rate-limit-upstash.md)).
- **Cambios de plan:** subir aplica ya y cobra la diferencia prorrateada por lo que queda del periodo; lo usado cuenta sobre el límite nuevo. Bajar se programa para la renovación. Cancelar conserva el plan hasta el fin del periodo.

### Paquetes por modelo

- Pagas X y recibes X × 1.2 de uso de **un** modelo, a precio cheaptokens.wtf. Vencen a los 90 días (`PACK_OFFERS`, `PACK_BONUS_BPS`, `PACK_VALIDITY_MS`).
- Se gasta primero el paquete que vence antes.

### Créditos

Siguen como en ADR-0008: prepago en USD, no vencen y se recargan de $10 a $1,000. Sin créditos gratis ([ADR-0018](./0018-sin-creditos-gratis.md)). Pagan cualquier modelo sin plan, sirven de excedente después del límite y alimentan las keys de solo créditos.

### Orden de cobro: plan → paquete del modelo → créditos

- **Antes del request, sin escrituras** (`admit` en `src/lib/billing/limits.ts`, llamado por `admitUsage` en `src/lib/gateway/authenticate.ts`). El plan y sus ventanas llegan en la misma query que la key. Pasa si al plan le queda límite. Si no, pasa si hay paquete del modelo o créditos permitidos. El saldo de paquetes es una query más y solo se hace cuando el plan no alcanza.
- **Después del request, en `after()`**, una transacción (`chargeRequest` en `src/lib/billing/ledger.ts`) bloquea la fila del workspace, reparte el costo (`splitCharge`) y actualiza ventanas, paquete y saldo con lo que le toca a cada uno. `requests` guarda el reparto en `plan_micro_usd`, `pack_micro_usd`, `credits_micro_usd` y `absorbed_micro_usd`, más `pack_id`. Un CHECK obliga a que los cuatro sumen `cost_micro_usd`.
- **El request que cruza el límite no se corta.** Lo que no cabe en el plan va al paquete y a los créditos si el excedente lo permite. Si no, lo absorbemos (`absorbed_micro_usd`) y el siguiente request recibe `429 usage_limit_reached` con `retry-after` hasta el reinicio.
- **Los créditos pueden quedar levemente negativos**, como en ADR-0008: se admite con saldo positivo y se cobra al terminar. En el excedente, el tope mensual limita cuánto.

### Excedente, por workspace

- **Modo:** `continue` (seguir con paquetes y créditos) o `stop` (`429` hasta el reinicio).
- **Con `continue`,** dos interruptores: usar paquetes y usar créditos.
- **Tope mensual** de créditos usados como excedente, por mes UTC. El default es $25. Al llegar al tope, lo que falta del request en curso se absorbe y el siguiente recibe `429`, salvo que tenga paquete del modelo.

### Por key

- **`billing_source`:** `plan_then_prepaid` (default), `plan_only` (nunca toca el prepago; sin plan activo responde `402 no_active_plan`) o `prepaid_only` (nunca gasta el plan; pensado para CI y producción).
- **`allowed_models`** limita los modelos de la key (`403 model_not_allowed_for_key`) y **`expires_at`** permite rotarla con 24 horas de gracia ([05 · API keys](../05-api-keys.md)).

### API

- **Errores nuevos:** `429 usage_limit_reached`, `402 no_active_plan` y `403 model_not_allowed_for_key`.
- **Headers nuevos** cuando la key cobra del plan (`src/lib/billing/headers.ts`): `x-usage-window-remaining` y `x-usage-week-remaining` (fracción de 0 a 1 con dos decimales, antes del request), y `x-usage-window-reset` y `x-usage-week-reset` (ISO 8601, solo con la ventana abierta). Nunca nombran al upstream.

### Pagos

- `payments` registra cada cobro: recargas, planes y paquetes. Cada compra es idempotente por `external_id` (`src/lib/billing/purchases.ts`).
- Mientras el MoR no apruebe el negocio ([ADR-0019](./0019-merchant-of-record.md)), solo existe un proveedor de desarrollo (`src/lib/payments/index.ts`): confirma al instante, no cobra nada y solo existe con `APP_ENV=development`. En preview y producción los pagos no están disponibles.

Detalle en [08 · Créditos y pagos](../08-creditos-y-pagos.md).

## Consecuencias

- Quien programa a diario tiene un gasto fijo. Lo variable sigue en créditos.
- **La admisión sigue sin escrituras.** Suma una query (paquetes) solo cuando el plan no alcanza.
- **Los cobros de un workspace se serializan:** la transacción bloquea su fila para no perder escrituras en ventanas ni en el tope. Con mucho paralelismo por workspace, la contención crece ([05 · API keys › Riesgos](../05-api-keys.md#riesgos-conocidos)).
- **Lo absorbido es pérdida directa.** Está acotado igual que el negativo de ADR-0008: ≈ requests en vuelo × costo máximo de un request, y queda medido en `absorbed_micro_usd`.
- **La conciliación cambia** (`src/lib/billing/reconcile.ts`): el saldo se compara contra `Σ requests.credits_micro_usd`, no contra el costo total, y hay un invariante nuevo para los paquetes. La migración `drizzle/0001_spotty_power_pack.sql` pone `credits_micro_usd = cost_micro_usd` en los requests anteriores.
- El límite de gasto de una key cuenta todo su costo, venga del plan, de un paquete o de créditos.
- **Todavía no hay renovación.** Con el proveedor de desarrollo, el periodo dura 30 días y vence. La renovación, el cambio de plan programado y `past_due` llegan con el webhook del MoR.
- **El proveedor de desarrollo depende de `APP_ENV`:** fuera de Vercel, sin `APP_ENV` ni `VERCEL_ENV`, la app se considera de desarrollo y regala pagos. Un servidor propio debe poner `APP_ENV=production`.

### Margen

**Es el riesgo principal de esta decisión.** Los límites se miden a precio de lista, no a nuestro costo.

- Usado al máximo, un mes (≈ 4.35 semanas) da unas 4.35 veces el límite semanal: ≈ $52 de uso en Plus, ≈ $130 en Pro y ≈ $391 en Max. **Los tres planes solo cubren su costo si el costo upstream es ≤ ~38 % del precio cheaptokens.wtf.**
- **Con Claude Opus 5.5 hoy no se cumple:** InferHub nos cobra $0.436 / $2.18 por 1M y lo vendemos a $0.48 / $2.40. El costo es ≈ 91 % del precio. Un Max usado al máximo solo con Opus 5.5 nos cuesta ≈ $355 al mes y paga $150.
- **Los paquetes tampoco cuadran con ese modelo:** el 20 % extra exige un costo ≤ 83 % del precio. El paquete de Opus 5.5 ($20 por $24 de uso) nos cuesta ≈ $21.80, antes de la comisión del MoR.
- **Antes de lanzar hay que calibrar los límites o medirlos de otra forma.** Por ejemplo: bajar los límites, sacar del plan o ponderar los modelos de margen bajo, o quitar los paquetes de esos modelos. Está en [12 · Preguntas abiertas](../12-preguntas-abiertas.md).

## Alternativas descartadas

- **Solo créditos, como decía ADR-0008:** no hay gasto fijo ni límites que se reinician, que es lo que el usuario de agentes ya conoce y compara.
- **Unidades opacas o mensajes por ventana, como Codex:** "N mensajes cada 5 horas" no dice cuánto vale cada uno. Un mensaje con Opus y 200 mil tokens de contexto cuesta muchas veces más que uno corto con un modelo barato, así que habría que inventar y defender una tabla de conversión. Medir en dólares a precio cheaptokens.wtf usa el mismo número que el catálogo y los créditos, y el usuario lo puede verificar.
- **Medir los límites al costo upstream:** el margen cuadraría por construcción, pero el mismo request gastaría distinto según el upstream que lo atendió, el límite cambiaría cuando cambia un upstream, y el cliente podría deducir nuestro costo comparando su uso con el catálogo. Se reconsidera si calibrar no alcanza.
- **Plan ilimitado con "uso justo":** sin techo explícito, el riesgo de margen no tiene límite y el "uso justo" se decide a mano.
- **Una sola cuota mensual:** se puede quemar en un día. La ventana de 5 horas reparte el uso y la semana pone el techo.
- **Cortar el request que cruza el límite:** rompe una respuesta a la mitad que el upstream nos cobra igual. Peor experiencia por el mismo costo.
- **Reserva previa del costo estimado:** sigue descartada por las razones de ADR-0008.
