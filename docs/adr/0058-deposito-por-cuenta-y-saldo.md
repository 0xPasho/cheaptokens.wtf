# ADR-0058: Cada cuenta deposita USDC en su propia dirección; el depósito es saldo y los planes se pagan con saldo

- **Estado:** Aceptada. Reemplaza a [ADR-0056](./0056-pagos-en-usdc.md). Mantiene en pausa [ADR-0019](./0019-merchant-of-record.md): mientras no haya MoR ni Stripe, USDC es el único medio de pago. Cambia [ADR-0049](./0049-suscripcion-con-limites.md): un plan se paga por 30 días con saldo y no se renueva solo, y los paquetes por modelo dejan de venderse.
- **Fecha:** 2026-11-17
- **Origen:** Usuario (una dirección propia por cuenta, que lo recibido termine en una wallet principal, que lo que se compra sean créditos para cualquier modelo y no paquetes por modelo, y que los planes también se paguen con cripto) + Default (el cómo)

## Contexto

- [ADR-0056](./0056-pagos-en-usdc.md) cobraba con una sola dirección por red y un monto único por orden. Obligaba a enviar el monto exacto antes de 30 minutos: si un exchange descontaba su comisión, el pago no se podía asignar solo.
- En una blockchain el dinero llega a la dirección a la que se envió. Para que termine en otra wallet, alguien tiene que firmar una transacción que lo mueva.
- Vender paquetes de un solo modelo complicaba lo que se compra. Lo que la gente compra son créditos: si deposita $12, tiene $12 para cualquier modelo.

## Decisión

### Direcciones de depósito

- **Cada workspace tiene una dirección fija en Solana y otra en Base.** No vencen: el cliente puede guardarlas y reusarlas. Se guardan en `deposit_addresses`.
- **La llave de cada dirección sale de una semilla:** HMAC-SHA256 de `CRYPTO_DEPOSIT_SEED` sobre `cheapllm.wtf/usdc/v1/deposit/<red>/<workspaceId>` (`src/lib/payments/crypto/keys.ts`). No se guarda ninguna llave. **La semilla es el único secreto de pagos.**
- **Una dirección guardada que ya no sale de la semilla no se muestra ni se barre.** Así nadie recibe una dirección que no se puede mover.
- **La derivación no se cambia nunca:** una prueba fija las direcciones que da una semilla conocida.

### Barrido

- **El barrido mira cuánto USDC hay en las direcciones, lo envía a la wallet principal y acredita cuando esa transacción queda confirmada** (`scanDeposits`, `src/lib/payments/crypto/deposits.ts`). **Lo acreditado es siempre lo que llegó a la wallet principal.**
- **Solana:** una transferencia de token firmada por la llave del depósito. La comisión la paga otra wallet (el fee payer), así que la dirección de depósito nunca necesita SOL. Se acredita cuando la transacción está finalizada.
- **Base:** `transferWithAuthorization` de USDC (EIP-3009). La llave del depósito firma una autorización sin gastar gas y otra wallet (el relayer) la envía. Así la dirección nunca necesita ETH. Se acredita con 10 bloques encima (`CRYPTO_BASE_CONFIRMATIONS`).
- **El barrido se guarda antes de enviarse** (`deposit_sweeps`) **y se acredita una sola vez,** por su id de transacción. Hay como mucho un barrido en vuelo por dirección.
- **Un barrido que ya no puede entrar se da por vencido y se manda otro.** En Solana, cuando la cadena finalizada pasó su última altura válida; en Base, cuando venció la autorización (10 minutos). Uno vencido se vuelve a mirar durante una hora: si al final entró, se acredita.
- **Si el nodo rechaza un barrido o falla en la cadena,** esa dirección espera un minuto antes de otro intento. Así un problema que se repite (la wallet de comisiones sin fondos) no llena la tabla de intentos.
- **Mínimo 1 USDC.** Menos que eso se queda en la dirección hasta juntar el mínimo.
- **Una red la barre un solo proceso a la vez** (`deposit_scans`): dos a la vez cruzarían los nonces del relayer de Base.

### Cuándo se revisa

- **Con el dashboard abierto:** el depósito pregunta cada 5 segundos (cada 20 después de 10 minutos). El servidor lee las direcciones de un workspace como mucho cada 4 segundos.
- **Cron de Vercel cada minuto** (`/api/internal/crypto-payments`): revisa las direcciones vigiladas (su dueño abrió el depósito en las últimas 24 horas) y un turno de 300 de las demás, de la que lleva más tiempo sin mirarse a la más reciente.
- **No hay webhooks.** El saldo de muchas direcciones se lee en una sola llamada por red (`getMultipleAccounts` en Solana, Multicall3 en Base).

### Qué se compra

- **El depósito se vuelve saldo, dólar por dólar.** El saldo son créditos: sirven para cualquier modelo.
- **Los planes se pagan con saldo** (`buyPlanWithBalance`, `src/lib/billing/purchases.ts`): 30 días desde la compra, sin renovación. Pagar el plan vigente suma 30 días al final del periodo. Subir de plan cobra la diferencia prorrateada. Un plan más barato se compra cuando termina el vigente.
- **Si el saldo no alcanza,** el diálogo de compra muestra el depósito y completa la compra cuando llega, mientras siga abierto. Si se cierra, el depósito queda como saldo.
- **La compra descuenta el saldo y entrega el plan en la misma transacción.** Queda un movimiento `purchase` negativo en `credit_transactions` y un pago con `payment_provider = balance`.
- **Los paquetes por modelo ya no se venden.** El cobro todavía sabe gastar uno que exista; el dashboard solo los muestra si queda alguno.

### Configuración

- `CRYPTO_DEPOSIT_SEED`: la semilla. Se genera con `pnpm payments:status --new-seed`.
- `CRYPTO_SOLANA_ADDRESS` y `CRYPTO_BASE_ADDRESS`: la wallet principal de cada red. **Solo su dirección pública: su llave nunca pasa por el servidor.** Una red sin wallet principal o sin semilla no se ofrece.
- **Protección contra una dirección mal copiada:** la de Base se pide con su suma de control (mayúsculas y minúsculas). En Solana el barrido solo envía a una wallet que ya tiene cuenta de USDC, y no la crea.
- **Las wallets de comisiones también salen de la semilla.** `pnpm payments:status` muestra sus direcciones y sus saldos; hay que fondearlas con SOL y con ETH en Base. El cron avisa cuando a una le queda poco (`deposit_fee_wallet_low`).
- `CRYPTO_SOLANA_RPC_URL` y `CRYPTO_BASE_RPC_URL`: el RPC de cada red. `CRYPTO_SOLANA_CLUSTER=devnet` y `CRYPTO_BASE_CHAIN=sepolia` cambian a las redes de prueba.
- **Desarrollo local sin configuración:** las direcciones son de ejemplo (de una semilla pública) y el depósito se simula.

## Consecuencias

- **El cliente manda el monto que quiera, cuando quiera.** Ya no hay órdenes que vencen, montos exactos ni pagos sin asignar por una comisión de exchange.
- **El servidor puede mover lo que todavía no se barrió.** Quien obtenga la semilla puede llevarse los depósitos en tránsito: lo de uno o dos minutos. La wallet principal queda fuera de su alcance.
- **La semilla no se puede perder ni cambiar:** lo que llegue a las direcciones actuales quedaría sin llave. Hay que guardarla también fuera de Vercel.
- **Cada barrido cuesta fracciones de centavo,** y hay que mantener fondeadas dos wallets de comisiones.
- **Otro token u otra red no se acreditan solos.** Se pueden recuperar a mano con la llave de esa dirección; todavía no hay una herramienta para hacerlo.
- **Quien deposita sin abrir el dashboard espera su turno:** con muchas cuentas, la vuelta completa tarda (cuentas ÷ 300) minutos por red.
- **Sin contracargos.** Los impuestos y la contabilidad siguen siendo nuestros ([preguntas abiertas](../12-preguntas-abiertas.md)).
- **Si la transacción del relayer de Base se atora,** los barridos de Base esperan detrás de ella hasta que entre.
- **Verificado contra mainnet solo con lecturas y simulaciones** (`tests/live/usdc.test.ts`): el contrato de USDC acepta la autorización firmada y el programa de tokens ejecuta el barrido. Falta un depósito real de punta a punta.

## Alternativas descartadas

- **Una sola dirección por red con monto único por orden ([ADR-0056](./0056-pagos-en-usdc.md)):** sin llaves en el servidor, pero el cliente tiene que enviar el monto exacto y cualquier diferencia se resuelve a mano.
- **Direcciones controladas por un contrato que solo envía a la wallet principal:** aunque roben el servidor, el dinero no puede ir a otro lado. Hay que escribir y revisar un contrato en Base y un programa en Solana. Queda como mejora si crece el volumen.
- **Cuentas de token de la wallet principal, una por cliente (Solana):** el dinero entraría directo, pero muchos exchanges no envían a esas direcciones.
- **Webhooks de Helius y Alchemy:** otra dependencia y otro secreto. Leer saldos por lotes alcanza para el volumen inicial.
- **Acreditar al ver el depósito y barrer después:** lo acreditado podría no coincidir con lo que llega a la wallet principal.
- **Guardar la intención de compra y cobrarla sola cuando llegue cualquier depósito:** alguien que solo quería saldo terminaría con un plan que no confirmó.
- **Dar un bono al depositar, como el de los paquetes:** sería un descuento sobre todos los modelos y rompe el margen mínimo ([ADR-0053](./0053-margen-minimo-de-30.md)).
