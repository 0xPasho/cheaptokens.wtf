# ADR-0056: Se cobra en USDC sobre Solana y Base, directo a nuestras wallets y por adelantado

- **Estado:** Reemplazada por [ADR-0058](./0058-deposito-por-cuenta-y-saldo.md) el mismo día, antes de publicarse: cada cuenta pasa a tener su propia dirección de depósito. Sigue en pie cobrar en USDC sobre Solana y Base y pagar los planes por 30 días.
- **Fecha:** 2026-11-17
- **Origen:** Usuario (USDC en Solana y en Base como único medio de pago por ahora, Stripe pendiente, planes también con cripto) + Default (el cómo)

## Contexto

- Ningún MoR aprobó el negocio por escrito ([ADR-0019](./0019-merchant-of-record.md)) y Stripe queda para después. Sin un medio de pago no se puede vender nada.
- Un pago en cripto no tiene contracargos: quita el riesgo de la tarjeta robada que quema créditos.
- A InferHub se le paga en USDC sobre Solana: lo cobrado en USDC puede fondear el upstream sin pasar por un banco.
- Un intermediario (NOWPayments y similares) cobra comisión y puede pedir verificación o retener fondos. Recibir directo en una wallet propia no tiene comisión, pero todo lo construimos nosotros.

## Decisión

### Redes y direcciones

- **USDC en Solana y en Base.** Cada red se activa con la dirección pública que recibe (`CRYPTO_SOLANA_ADDRESS`, `CRYPTO_BASE_ADDRESS`). Las llaves privadas nunca pasan por el servidor.
- **Una sola dirección por red para todos los clientes.** No se derivan direcciones por cliente: no hay que custodiar ni barrer fondos.
- **Cada red se lee con su RPC** (`CRYPTO_SOLANA_RPC_URL`, `CRYPTO_BASE_RPC_URL`). En Solana se cuenta lo finalizado; en Base, lo que tiene 10 bloques encima (`CRYPTO_BASE_CONFIRMATIONS`).
- `CRYPTO_SOLANA_CLUSTER=devnet` y `CRYPTO_BASE_CHAIN=sepolia` cambian a las redes de prueba, con su USDC de prueba.

### Órdenes con monto único

- **Cada compra abre una orden** (`payment_orders`) con el precio más unos centavos que la distinguen: de $0.01 a $0.99, y hasta $4.99 si esos están ocupados. **Lo que se suma no se pierde: se acredita como saldo.**
- **Una transferencia por el monto exacto paga la orden,** llegue por Solana o por Base. Así se reconoce de quién es sin pedir memo ni referencia, que muchos exchanges no permiten.
- **Centavos completos:** cualquier exchange puede enviar el monto. USDC tiene 6 decimales en las dos redes, así que 1 unidad = 1 µUSD.
- **La orden espera 30 minutos.** Después se muestra vencida, pero **un pago tardío por su monto se acredita igual**.
- **Un monto no se reusa en 48 horas.** Así un pago tardío nunca cae en la orden de otro cliente.
- **Un workspace tiene como mucho 5 órdenes abiertas.** Pedir otra vez la misma compra devuelve la orden abierta.

### Detección

- **`scanPayments`** lee lo nuevo de cada red desde su cursor (`crypto_cursors`): en Solana, las firmas de las cuentas de token de USDC de nuestra wallet; en Base, los eventos `Transfer` del contrato de USDC hacia nuestra dirección.
- **Lo llaman el cron de Vercel cada minuto** (`/api/internal/crypto-payments`) **y el diálogo de pago abierto, cada 5 segundos.** Cada red se revisa como mucho cada 10 segundos, la pida quien la pida.
- **«Ya lo envié»:** el cliente puede pegar la firma, el hash o el link de Solscan o Basescan. Se lee esa transacción en el momento, sin esperar al barrido.
- **Cada transferencia se guarda una sola vez** (`crypto_transfers.external_id`: `solana:<firma>` o `base:<hash>:<índice>`). Leerla dos veces no acredita dos veces.
- **Una transferencia que no coincide con ninguna orden queda con `order_id` null** para resolverla a mano (otro monto, una comisión de exchange descontada, otra red).

### Qué entrega cada pago

- **Recarga:** se acredita todo lo recibido.
- **Paquete:** el paquete, y los centavos de más como saldo.
- **Plan:** 30 días desde el pago. **Pagar el plan vigente suma 30 días al final del periodo actual.** Subir de plan cobra la diferencia prorrateada, como antes. **Un plan más barato se compra cuando termina el vigente;** ya no se programa un cambio para la renovación.
- **Lo que ya no se puede entregar queda como saldo:** un paquete que dejó de existir, una subida cuyo plan venció mientras tanto, un plan más barato que el vigente.
- **Pagar dos veces la misma orden** acredita la segunda transferencia como saldo.
- **El recibo es la transacción:** `payments.receipt_url` enlaza a Solscan o Basescan. `payments.payment_provider` es `usdc-solana` o `usdc-base`.

### Desarrollo local

- Sin direcciones, `APP_ENV=development` muestra direcciones de ejemplo y el diálogo ofrece «Simular pago», que paga la orden con una transferencia de la red `dev`. En preview y producción sin direcciones, los pagos se muestran como no disponibles.
- Reemplaza al proveedor de desarrollo que confirmaba al instante (`src/lib/payments/index.ts` ya no existe).

## Consecuencias

- **Sin comisión y sin contracargos.** Nadie puede congelar los fondos.
- **No hay cobro automático:** un plan dura 30 días y el cliente vuelve a pagar. Ya no existen cancelar ni programar una bajada.
- **Pagos que no coinciden se resuelven a mano.** Hay que revisar `crypto_transfers` con `order_id` null y acreditar con `pnpm credits:grant`. Falta un canal de soporte que el diálogo pueda nombrar.
- **El RPC público de Solana limita `getTransaction`.** En producción conviene uno propio (Helius, Triton). El de Base tolera el volumen inicial.
- **Impuestos y contabilidad siguen siendo nuestros:** no hay MoR que los calcule ni emita facturas. Hay que validarlo con un contador que conozca ingresos en cripto ([preguntas abiertas](../12-preguntas-abiertas.md)).
- **Seguridad de las wallets:** quien controla las llaves controla lo cobrado. Deben ser wallets propias, idealmente de hardware.
- **Stripe o un MoR se suman después** como otro medio de pago; las compras (`src/lib/billing/purchases.ts`) ya son idempotentes por `external_id`.

## Alternativas descartadas

- **NOWPayments u otro procesador cripto:** cobra comisión y puede pedir KYC o retener fondos.
- **Una dirección por orden:** en Solana y Base obliga a custodiar llaves o a barrer fondos desde muchas direcciones.
- **Referencia de Solana Pay en vez de monto único:** no la envían los exchanges ni existe en Base. El link de Solana Pay se ofrece igual, sin referencia, para abrir la wallet con el monto puesto.
- **Montos con 6 decimales:** más órdenes simultáneas, pero muchos exchanges solo permiten 2 decimales al retirar.
- **Bitcoin:** el precio se mueve entre la orden y la confirmación, y la confirmación tarda de 10 a 60 minutos. Queda para después.
- **Acreditar automáticamente un monto parecido:** cualquiera podría reclamar la transferencia de otro cuyo monto no coincidió.
