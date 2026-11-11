# ADR-0019: Merchant of Record para las recargas

- **Estado:** Propuesta (pasa a Aceptada cuando un MoR apruebe el negocio por escrito). Reemplaza a [ADR-0009](./0009-stripe-checkout.md).
- **Fecha:** 2026-11-08
- **Origen:** Usuario (usar un MoR) + Default (proveedor, interfaz y plan B)

## Contexto

- Vendemos créditos a todo el mundo desde una empresa mexicana ([ADR-0020](./0020-intermediario-entidad-mexico.md)). Si cobráramos con Stripe directo, seríamos el vendedor legal frente a cada comprador, y tendríamos que registrarnos para cobrar y declarar IVA, GST o sales tax en cada país donde superemos los umbrales.
- Un **Merchant of Record (MoR)** es el vendedor legal: cobra y paga los impuestos, emite las facturas al cliente, atiende los contracargos y nos transfiere lo neto.
- **Dependencia oculta:** los MoR restringen justo nuestro tipo de negocio. Revisado el 2026-11-08:
  - **Paddle** prohíbe "Reseller Products" y "Virtual currency or stored value, including … store credit".
  - **Polar** prohíbe "Selling others' products or services using Polar against an upfront payment" y somete a revisión adicional las herramientas de generación de contenido con IA.

  cheaptokens.wtf vende saldo prepagado para usar modelos de terceros, así que cualquiera de los dos podría rechazarlo.

## Decisión

- **Las recargas se cobran con un MoR.**
  - **Primera opción: Polar.** Su página de precios dice 4% + 40¢ por transacción. Paga a vendedores en México mediante Stripe Connect Express (México está en su lista de países), y está pensado para developers.
  - **Segunda opción: Paddle**, alrededor de 5% + 50¢.
- **Antes de escribir código de pagos**, se solicita la cuenta en los dos con una descripción exacta del negocio ("API de inferencia de LLMs con cobro por uso prepagado, sobre modelos de terceros") y **se pide la aprobación por escrito**. No se describe el producto como algo que no es: si el MoR lo descubre después, congela los fondos y cierra la cuenta.
- **Qué son los créditos:** saldo prepagado para usar el servicio cheaptokens.wtf. No es transferible, no se puede retirar, no tiene valor fuera del servicio y no se reembolsa salvo error. Esa es la descripción real. Si eso cuenta o no como "stored value", lo decide el MoR.
- **Interfaz `PaymentProvider`** en `src/lib/billing/`, para que el resto del sistema no sepa qué MoR usamos:
  - `createTopupCheckout({ workspaceId, amountUsd, locale, returnUrl })` → URL del checkout.
  - `parseWebhook(request)` → `TopupPaid | Refunded | Disputed | Ignored`, después de verificar la firma.
  - Un solo endpoint: `/api/webhooks/payments`.
- **Los créditos equivalen al subtotal sin impuestos:** el cliente elige $10, el MoR agrega el impuesto que corresponda en el checkout y nosotros acreditamos $10.
- **Plan B, si ningún MoR aprueba:** Stripe directo con Stripe Tax ([ADR-0009](./0009-stripe-checkout.md)), registrándonos solo donde sea obligatorio y con un contador que lo lleve.

## Consecuencias

- No tenemos que registrarnos en el extranjero para cobrar impuestos. El MoR factura al cliente y maneja los contracargos.
- **Comisión más alta:** en una recarga de $10, unos $0.80 (8%) con Polar o unos $1.00 (10%) con Paddle, más los costos de payout. Esto afecta la [pregunta abierta](../12-preguntas-abiertas.md) sobre absorber la comisión y el monto mínimo.
- **Recibimos todo de un solo cliente (el MoR), en USD.** Para la contabilidad en México eso probablemente es una exportación de servicios, a confirmar con un contador.
- **Los clientes mexicanos que necesiten factura (CFDI)** dependen de lo que emita el MoR. Puede ser una limitación para clientes B2B en México.
- El MoR puede cerrar la cuenta. Por eso existe la interfaz: cambiar de proveedor es reescribir un adaptador.
- Antifraude: el MoR atiende las disputas, y nosotros suspendemos el workspace cuando llega el evento `Disputed`.

## Alternativas descartadas

- **Stripe directo + Stripe Tax ([ADR-0009](./0009-stripe-checkout.md)):** seríamos el vendedor legal en cada país. Queda como plan B.
- **Lemon Squeezy, Creem y otros MoR:** comisiones y restricciones parecidas. Se evalúan si Polar y Paddle rechazan.
- **Describir el negocio de forma ambigua para que lo aprueben:** si lo descubren después, el riesgo es perder los fondos retenidos y la cuenta.
