# 12 · Preguntas abiertas

Lo que falta decidir o conseguir. Cada pregunta tiene un **default**: es lo que se implementa si nadie dice otra cosa. Cuando se resuelve una, se mueve a un ADR y se borra de aquí.

## Resueltas el 2026-11-10

| Pregunta | Respuesta | ADR |
|---|---|---|
| ¿Con qué upstream se prueba el gateway? | InferHub, con tope de precio por request. OpenRouter sale del plan | [0028](./adr/0028-inferhub-upstream-de-pruebas.md) |
| ¿Qué modelos tiene el catálogo de pruebas? | Claude Haiku 4.5 (baja a 78%) y tres modelos ocultos de Qwen, DeepSeek y GLM | [0029](./adr/0029-catalogo-de-pruebas-inferhub.md) |
| ¿Se cobra un mínimo por request? | Sí: 10 µUSD por request que genera salida, igual que el upstream | [0030](./adr/0030-cobro-minimo-por-request.md) |
| ¿Pasa el razonamiento de los modelos al cliente? | Sí, como `reasoning_content` | [0031](./adr/0031-reasoning-content-pasa-al-cliente.md) |
| ¿Qué base se usa en desarrollo? | PGlite, con node-postgres en todos lados | [0032](./adr/0032-postgres-node-postgres-y-pglite.md) |
| ¿Nombre y dominio definitivo? (era la 4) | `cheaptokens.wtf`, con la API en `api.cheaptokens.wtf` | [0026](./adr/0026-marca-cheaptokens-wtf.md) |
| ¿Comparte marca con Deska? (parte de la 9) | No: la marca es propia | [0026](./adr/0026-marca-cheaptokens-wtf.md) |
| ¿Prefijo de las API keys? | `wtf_` | [0027](./adr/0027-formato-api-keys-wtf.md) |

## Resueltas el 2026-11-08

| Pregunta | Respuesta | ADR |
|---|---|---|
| ¿Cómo se cobran los impuestos globales? | Merchant of Record | [0019](./adr/0019-merchant-of-record.md) |
| ¿Entidad legal y país? | México | [0020](./adr/0020-intermediario-entidad-mexico.md) |
| ¿Dominio? | Uno temporal, mientras se elegía la marca | [0021](./adr/0021-dominios.md), reemplazado por [0026](./adr/0026-marca-cheaptokens-wtf.md) |
| ¿Cómo declaramos a los upstreams? | Somos intermediarios. Se declara la categoría sin nombres | [0020](./adr/0020-intermediario-entidad-mexico.md) |
| ¿OpenRouter como primer upstream? | Sí, como upstream de la fase de pruebas. Producción se decide después. Reemplazado el 2026-11-10 por InferHub | [0024](./adr/0024-openrouter-upstream-de-pruebas.md) |

## Bloquean el lanzamiento

### 1. Elegir los upstreams de producción

Se decide al cerrar la fase de pruebas, que corre con InferHub y el upstream simulado ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)). InferHub es candidato, pero le faltan la prueba de fidelidad y una semana de disponibilidad, y sus vendedores revenden suscripciones. Los candidatos pasan la [lista de requisitos](./07-upstreams.md#requisitos-para-aceptar-un-upstream). Lo que más pesa es que su costo deje margen con el descuento que queremos mostrar. *Sin default.*

### 2. Aprobación por escrito de un MoR

Solicitar cuenta en Polar y en Paddle con la descripción exacta del negocio y pedir la confirmación por escrito ([ADR-0019](./adr/0019-merchant-of-record.md)). Si los dos rechazan, se activa el plan B: Stripe directo con Stripe Tax ([ADR-0009](./adr/0009-stripe-checkout.md)). *Default: Polar.*

### 3. Validación legal y fiscal en México

- **Abogado:** términos de servicio, política de uso aceptable trasladada y aviso de privacidad (LFPDPPP, más GDPR si hay usuarios en la UE) ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)).
- **Contador:** facturación al MoR (probable exportación de servicios), IVA por los servicios que compramos a upstreams extranjeros, y qué pasa con los clientes mexicanos que pidan CFDI.

*Sin default: lo tienen que revisar ellos.*

### 4. Registrar `cheaptokens.wtf`

El nombre y el dominio ya están decididos ([ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)), pero el 2026-11-10 el dominio seguía libre, sin registrar. Hay que comprarlo **antes de anunciar el nombre** y antes de configurarlo en Vercel y en Clerk. *Sin default.*

## No bloquean (los defaults ya están en los docs)

### 5. ¿Absorbemos la comisión del MoR o la cobramos aparte? ¿Subimos el mínimo de recarga?

Con un MoR, una recarga de $10 pierde unos $0.80–$1.00 (8–10%) en comisión, y una de $20 alrededor de 6–7.5%.

- (a) La absorbemos y mantenemos el mínimo en $10: pagas $10 (más impuestos) y recibes $10.
- (b) La absorbemos, pero subimos el mínimo a $20.
- (c) Cobramos una comisión transparente sobre la recarga (por ejemplo +5%).

*Default: (a). Es lo más simple de explicar y baja la fricción de la primera recarga. Se revisa con datos reales.*

### 6. ¿Los créditos expiran?

*Default: no expiran. Tiene que quedar en los términos.* Ojo: si un upstream expira **nuestros** créditos prepagados (OpenRouter lo hace a los 365 días), es otra razón para prepagarles poco.

### 7. ¿Qué margen mínimo sobre el costo upstream?

*Default: 10% (`MIN_MARGIN`), validado al sincronizar ([06](./06-catalogo-y-precios.md#margen-mínimo)).*

### 8. ¿Qué rate limit inicial?

*Default: 60 requests/min por workspace, con override por workspace ([ADR-0017](./adr/0017-rate-limit-upstash.md)).*

### 9. ¿cheaptokens.wtf comparte usuarios con Deska?

La marca ya es propia ([ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)). *Default: tampoco comparte usuarios: tiene su propia instancia de Clerk.*
