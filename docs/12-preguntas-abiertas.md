# 12 · Preguntas abiertas

Lo que falta decidir o conseguir. Cada pregunta tiene un **default**: es lo que se implementa si nadie dice otra cosa. Cuando se resuelve una, se mueve a un ADR y se borra de aquí.

## Resueltas el 2026-11-15

| Pregunta | Respuesta | ADR |
|---|---|---|
| ¿Hay suscripción? | Sí: planes Plus, Pro y Max con un límite cada 5 horas y otro cada semana, paquetes por modelo y créditos de respaldo. Los límites están por calibrar (#10) | [0049](./adr/0049-suscripcion-con-limites.md) |
| ¿Cómo se entra sin la instancia de Clerk? | Solo en desarrollo, con un nombre. Preview y producción necesitan Clerk (#11) | [0050](./adr/0050-login-clerk-y-modo-desarrollo.md) |

## Resueltas el 2026-11-10

| Pregunta | Respuesta | ADR |
|---|---|---|
| ¿Con qué upstream se prueba el gateway? | InferHub, con tope de precio por request. OpenRouter sale del plan | [0028](./adr/0028-inferhub-upstream-de-pruebas.md) |
| ¿Qué modelos tiene el catálogo de pruebas? | Claude Haiku 4.5 (baja a 78%) y tres modelos ocultos de Qwen, DeepSeek y GLM | [0029](./adr/0029-catalogo-de-pruebas-inferhub.md) |
| ¿Se cobra un mínimo por request? | Sí: 10 µUSD por request que genera salida, igual que el upstream | [0030](./adr/0030-cobro-minimo-por-request.md) |
| ¿Pasa el razonamiento de los modelos al cliente? | Sí, como `reasoning_content` | [0031](./adr/0031-reasoning-content-pasa-al-cliente.md) |
| ¿Qué base se usa en desarrollo? | PGlite, con node-postgres en todos lados | [0032](./adr/0032-postgres-node-postgres-y-pglite.md) |
| ¿Nombre y dominio definitivo? (era la 4) | `cheapllm.wtf`, con la API en `api.cheapllm.wtf` | [0051](./adr/0051-marca-cheapllm-wtf.md) |
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

Solicitar cuenta en Polar y en Paddle con la descripción exacta del negocio y pedir la confirmación por escrito ([ADR-0019](./adr/0019-merchant-of-record.md)). La descripción incluye los planes mensuales y los paquetes por modelo, no solo las recargas ([ADR-0049](./adr/0049-suscripcion-con-limites.md)). Si los dos rechazan, se activa el plan B: Stripe directo con Stripe Tax ([ADR-0009](./adr/0009-stripe-checkout.md)). *Default: Polar.* **En pausa:** mientras tanto se cobra solo en USDC ([ADR-0058](./adr/0058-deposito-por-cuenta-y-saldo.md)), así que ya no bloquea vender; sí bloquea cobrar con tarjeta.

### 3. Validación legal y fiscal en México

- **Abogado:** términos de servicio, política de uso aceptable trasladada y aviso de privacidad (LFPDPPP, más GDPR si hay usuarios en la UE) ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)).
- **Contador:** cómo se registran los ingresos en USDC y en Bitcoin sin MoR ([ADR-0058](./adr/0058-deposito-por-cuenta-y-saldo.md), [ADR-0063](./adr/0063-pagos-en-bitcoin.md)), a qué tipo de cambio se reconoce un pago en BTC que se queda en BTC y el IVA de cada cliente; si vuelve un MoR, la facturación a él (probable exportación de servicios); IVA por los servicios que compramos a upstreams extranjeros, y qué pasa con los clientes mexicanos que pidan CFDI.

*Sin default: lo tienen que revisar ellos.*

### 4. Registrar `cheapllm.wtf`

El nombre y el dominio ya están decididos ([ADR-0051](./adr/0051-marca-cheapllm-wtf.md)), pero el 2026-11-17 el dominio seguía libre, sin registrar. El primer nombre, `cheaptokens.wtf`, se perdió justo por eso: lo registró un tercero antes que nosotros. Hay que comprarlo ya, **antes de anunciar el nombre** y antes de configurarlo en Vercel y en Clerk. *Sin default.*

### 10. Calibrar los límites de los planes y el margen

Los límites de Plus, Pro y Max se miden a precio cheapllm.wtf, y sus valores son iniciales ([ADR-0049 › Margen](./adr/0049-suscripcion-con-limites.md#margen)). Usados al máximo, los tres planes solo cubren su costo si el costo upstream es ≤ ~38 % del precio. Con Claude Opus 5.5 es ≈ 91 % (InferHub nos cobra $0.436 / $2.18 por 1M y lo vendemos a $0.48 / $2.40). Los paquetes, con 20 % extra, necesitan ≤ 83 %.

- (a) Bajar los límites hasta que el peor caso cuadre con el modelo de menor margen.
- (b) Ponderar por modelo: los de margen bajo gastan el límite con un multiplicador o quedan fuera del plan y de los paquetes.
- (c) Medir los límites al costo upstream (descartado por ahora en ADR-0049).
- (d) Aceptar la pérdida del peor caso, si el uso real queda lejos del máximo, y vigilar el margen por plan.

*Sin default: se decide con el costo de los upstreams de producción (#1). Hasta entonces los valores de `src/lib/billing/plans.ts` son de prueba.*

### 11. Crear la instancia de Clerk

El login con Clerk ya está en el código y se activa con `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` ([ADR-0050](./adr/0050-login-clerk-y-modo-desarrollo.md)). Falta crear la instancia propia (#9), configurarla con el dominio (#4), elegir los métodos de inicio de sesión y registrar el webhook `user.deleted` con `CLERK_WEBHOOK_SIGNING_SECRET`. Sin ella, preview y producción no dejan iniciar sesión. *Sin default: la tiene que crear el dueño.*

## No bloquean (los defaults ya están en los docs)

### 5. ¿Absorbemos la comisión del MoR o la cobramos aparte? ¿Subimos el mínimo de recarga?

Con un MoR, una recarga de $10 pierde unos $0.80–$1.00 (8–10%) en comisión, y una de $20 alrededor de 6–7.5%.

- (a) La absorbemos y mantenemos el mínimo en $10: pagas $10 (más impuestos) y recibes $10.
- (b) La absorbemos, pero subimos el mínimo a $20.
- (c) Cobramos una comisión transparente sobre la recarga (por ejemplo +5%).

*Default: (a). Es lo más simple de explicar y baja la fricción de la primera recarga. Se revisa con datos reales.*

### 6. ¿Los créditos expiran?

*Default: no expiran. Tiene que quedar en los términos.* Los paquetes por modelo sí vencen a los 90 días ([ADR-0049](./adr/0049-suscripcion-con-limites.md)), y eso también va en los términos. Ojo: si un upstream expira **nuestros** créditos prepagados (OpenRouter lo hace a los 365 días), es otra razón para prepagarles poco.

### 7. ¿Qué margen mínimo sobre el costo upstream?

*Decidido el 2026-11-17: 30% (`MIN_MARGIN`), validado al sincronizar ([06](./06-catalogo-y-precios.md#margen-mínimo), [ADR-0053](./adr/0053-margen-minimo-de-30.md)). Los planes usados al máximo siguen sin cuadrar (#10).*

### 8. ¿Qué rate limit inicial?

*Default: 60 requests/min por workspace, con override por workspace ([ADR-0017](./adr/0017-rate-limit-upstash.md)). Con plan: 60 en Plus, 120 en Pro y 300 en Max ([ADR-0049](./adr/0049-suscripcion-con-limites.md)).*

### 9. ¿cheapllm.wtf comparte usuarios con Deska?

La marca ya es propia ([ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)). *Default: tampoco comparte usuarios: tiene su propia instancia de Clerk.*

### 10. ¿Dónde pide ayuda quien envió otro token u otra red?

Un depósito de otro token, o de USDC por otra red, no se acredita solo ([ADR-0058](./adr/0058-deposito-por-cuenta-y-saldo.md)). Se puede recuperar a mano con la llave de esa dirección, pero el dashboard no nombra un canal ni existe la herramienta. *Sin default: falta elegir un correo o un Discord de soporte.*

### 11. ¿Quién guarda la semilla de los depósitos?

De `CRYPTO_DEPOSIT_SEED` salen todas las direcciones de depósito ([ADR-0058](./adr/0058-deposito-por-cuenta-y-saldo.md)). Si se pierde, lo que llegue a las direcciones actuales queda sin llave; si se filtra, quien la tenga puede mover lo que todavía no se barrió. *Default: un gestor de contraseñas además de Vercel, con acceso de una sola persona.*
