# ADR-0063: Se cobra también en Bitcoin on-chain, con cotización de 15 minutos y una xpub de solo lectura

- **Estado:** Aceptada. Suma un medio de pago a [ADR-0058](./0058-deposito-por-cuenta-y-saldo.md), que sigue en pie para USDC. Cambia una regla de ADR-0058 solo para Bitcoin: un pago en Bitcoin puede completar la compra de un plan aunque se haya cerrado el diálogo, porque la orden guarda qué se compró. Retoma lo que [ADR-0056](./0056-pagos-en-usdc.md) dejó para después.
- **Fecha:** 2026-11-17
- **Origen:** Usuario (Bitcoin para créditos y para planes, una ventana corta en la que el precio queda fijo, aceptar perder un poco si el precio se mueve, solo on-chain por ahora, acreditar un pago tardío al precio del momento, absorber hasta 2 % para que el plan entre, detectar con mempool.space) + Default (el cómo)

## Contexto

- [ADR-0056](./0056-pagos-en-usdc.md) dejó Bitcoin fuera por dos razones: el precio se mueve entre la orden y la confirmación, y la confirmación tarda de 10 a 60 minutos.
- Lo primero se resuelve fijando el precio por un rato y aceptando la pérdida pequeña si se mueve. Lo segundo no se puede evitar on-chain: desde Bitcoin Core 28 cualquier nodo acepta reemplazar una transacción sin confirmar (full-RBF), y en la 29 ya no se puede apagar. Acreditar sin confirmación deja que el cliente se lleve el saldo y redirija el pago.
- En ADR-0058 la compra de un plan se completa sola solo mientras el diálogo sigue abierto. Con una confirmación de 10 a 60 minutos nadie lo deja abierto.
- Los exchanges agrupan los retiros de BTC: suelen tardar de 10 a 60 minutos en emitirlos. Una ventana de 5 minutos casi nunca la alcanza un pago desde un exchange.
- En Bitcoin un barrido como el de ADR-0058 paga su propia comisión, de $0.30 a $3, y obliga a tener llaves en el servidor. Una wallet HD ya da una dirección distinta por pago sin mover nada: todas son de la misma wallet.

## Decisión

### Wallet y direcciones

- **El servidor solo tiene la xpub de una cuenta BIP84** (`CRYPTO_BITCOIN_XPUB`, en formato `xpub` o `zpub`; `tpub` o `vpub` en las redes de prueba). Ninguna llave privada pasa por el servidor: quien lo robe no puede mover nada.
- **Lo que se recibe ya está en la wallet principal.** No hay barrido ni wallet de comisiones.
- **Direcciones P2WPKH (`bc1q…`)**, de la rama de recibir: `m/84'/0'/<cuenta>'/0/<índice>`. Las acepta cualquier wallet o exchange.
- **La xpub tiene que ser de una cuenta dedicada a cheapllm.wtf.** Si el dueño recibe otra cosa en esa cuenta, su wallet y el servidor usarían los mismos índices.
- **Cada workspace tiene una dirección vigente, y cambia cuando recibe un pago.** Las anteriores se siguen revisando y lo que llegue a ellas se acredita al mismo workspace (`bitcoin_addresses`). Cada workspace tiene a lo más una dirección sin usar: así el hueco de índices sin uso (el *gap limit* de la wallet) solo crece con quien cotizó y nunca pagó.
- **En Sparrow hay que subir el gap limit** (Settings › Advanced) por encima de las direcciones sin usar que muestra `pnpm payments:status`. Si no, la wallet no ve los pagos de índices altos. El dinero no se pierde: aparece al subirlo.
- **Una dirección guardada que ya no sale de la xpub no se muestra ni se revisa.** Lo mismo que hace ADR-0058 con la semilla.
- **`pnpm payments:status` muestra la primera dirección que da la xpub,** para compararla con la que muestra la wallet antes de cobrar.

### Cotización

- **Cada compra en Bitcoin abre una cotización** (`bitcoin_orders`): cuánto en USD, cuántos sats, a qué precio, en qué dirección y para qué (créditos o un plan). **El precio queda fijo 15 minutos.**
- **Lo que se ve llegar a la dirección hasta 2 minutos después del vencimiento usa el precio cotizado,** hasta lo cotizado más 10 %. Esos 2 minutos cubren la demora en revisar. **Lo que pase del 10 % se acredita al precio del momento:** así nadie fija el precio de $10 y manda $10,000.
- **Lo que llega después se acredita al precio del momento en que lo vemos en la red,** no al cotizado. La ventana significa algo y no hay que decidir a mano.
- **Una cotización nueva del mismo workspace reemplaza a la anterior.** Hay como mucho una vigente.
- **El precio es la mediana de Coinbase, Kraken y Bitstamp,** guardada 30 segundos. Hacen falta al menos dos fuentes que no difieran más de 1 %; si no, no se cotiza. **No se cobra margen sobre ese precio:** la pérdida por el movimiento la absorbemos.
- **Créditos desde $10.** Para un plan se cotiza lo que falta después del saldo, igual que con USDC.

### Detección y acreditación

- **Se lee con una API Esplora: mempool.space por default** (`CRYPTO_BITCOIN_ESPLORA_URL`). Se puede apuntar a una instancia propia sin tocar código.
- **El precio se fija cuando la transacción aparece en la red; el saldo se acredita con 1 confirmación** (`CRYPTO_BITCOIN_CONFIRMATIONS`). Nunca con 0.
- **Cada salida que paga una dirección nuestra se acredita una sola vez** (`bitcoin_receipts`, por `txid` y `vout`). El pago lleva `external_id = bitcoin:<txid>:<vout>` y `payment_provider = bitcoin`. El recibo enlaza a la transacción en mempool.space.
- **Una transacción que desaparece sin confirmarse** (reemplazada o expulsada del mempool) se da por perdida a los 30 minutos y deja de mostrarse. Si el reemplazo también paga nuestra dirección, entra como un pago nuevo, con el precio del momento en que se ve.
- **Cuándo se revisa:** con el diálogo abierto, cada 10 segundos (cada 30 después de 10 minutos). El cron de cada minuto revisa las direcciones con cotización o pago en las últimas 24 horas y un turno de 20 de las demás. Cada dirección se lee como mucho cada 4 segundos. Si la API responde `429`, la corrida se corta y sigue en la siguiente.

### Qué entrega cada pago

- **Todo pago se vuelve saldo primero,** con el precio que le toca.
- **Si la cotización era de un plan,** al confirmarse se compra con el saldo, con `buyPlanWithBalance` y en la misma transacción. **Se puede cerrar el diálogo:** la orden guarda qué se compró. Esto no es la alternativa que ADR-0058 descartó, porque la intención va ligada a una cotización que la persona confirmó y no a cualquier depósito.
- **Si al saldo le falta hasta 2 % del precio, el plan entra igual.** La diferencia queda como un ajuste positivo en `credit_transactions`, con nota.
- **El plan no se compra:**
  - si falta más de 2 % (lo recibido queda como saldo, y otro pago a la misma cotización vuelve a intentarlo);
  - si el plan vigente cambió desde la cotización (por ejemplo, ya lo pagó con USDC): no se le suman otros 30 días sin pedirlo;
  - con pagos que se ven más de 24 horas después de cotizar.

### Configuración

- `CRYPTO_BITCOIN_XPUB`: la xpub de la cuenta. Sin ella, Bitcoin no se ofrece.
- `CRYPTO_BITCOIN_NETWORK`: `mainnet` (default), `testnet4` o `signet`.
- `CRYPTO_BITCOIN_ESPLORA_URL`: default `https://mempool.space/api`, o la de la red de prueba.
- `CRYPTO_BITCOIN_CONFIRMATIONS`: default 1.
- **Desarrollo local sin xpub:** la xpub es de ejemplo (la frase pública de BIP84, en signet) y los botones del diálogo simulan «visto en la red» y «confirmado».

## Consecuencias

- **Sin comisión, sin contracargos y sin llaves en el servidor.**
- **Lo cobrado en BTC se queda en BTC** hasta que se convierta a mano. A InferHub se le paga en USDC: hasta convertirlo, el precio de lo cobrado se mueve.
- **Gastar después muchas entradas pequeñas cuesta comisión.** Por eso las compras de créditos empiezan en $10.
- **Quien paga desde un exchange casi siempre llega después de la ventana:** recibe el precio de ese momento, que puede ser un poco más o un poco menos. Un plan entra igual si la diferencia no pasa de 2 %.
- **mempool.space ve qué direcciones consultamos** y puede relacionarlas. Su límite de peticiones no está publicado: con muchas direcciones vigiladas puede responder `429`, y esa corrida se salta. La salida es una instancia propia de Esplora.
- **Una transacción reemplazada después de verse dentro de la ventana** se acredita al precio del momento en que se ve el reemplazo.
- **Un cliente puede aprovechar la tolerancia** mandando 2 % menos a propósito. El costo máximo es 2 % de un plan.
- **El gap limit de la wallet hay que vigilarlo** con `pnpm payments:status`.
- **Contabilidad:** cada pago guarda el precio que se aplicó y su fuente (`bitcoin_receipts.rate_micro_usd`, `rate_source`). Lo tiene que validar un contador ([preguntas abiertas](../12-preguntas-abiertas.md)).

## Alternativas descartadas

- **Barrer desde direcciones derivadas de `CRYPTO_DEPOSIT_SEED`, como en USDC:** cada barrido paga una comisión on-chain y el servidor tendría llaves con BTC.
- **Lightning (phoenixd):** se acredita en segundos y la factura ya trae su vencimiento, pero es una wallet caliente en el servidor y cuesta 1 % más la comisión de red por la liquidez de entrada. Queda para una segunda fase.
- **BTCPay Server:** resuelve cotización, xpub y tolerancia, pero necesita Docker y un nodo completo, y [ADR-0059](./0059-servidor-propio-con-pm2-y-nginx.md) descartó Docker en el servidor.
- **Un nodo propio (Bitcoin Core podado con la xpub como wallet de solo lectura):** más privado, pero la primera sincronización tarda días y el servidor ya va justo de memoria. Cambiar a él después solo cambia el adaptador.
- **Acreditar con 0 confirmaciones:** con full-RBF el pago se puede redirigir después de acreditado.
- **Honrar el precio cotizado hasta una hora después del vencimiento:** mejor para quien paga desde un exchange, pero regala a cada cliente una opción de una hora sobre el precio.
- **Una dirección fija por workspace, como en USDC:** reusar direcciones expone en la cadena todos los pagos de una cuenta juntos.
- **Una dirección nueva por cotización:** cada cotización abandonada agranda el hueco de índices sin uso.
- **Ventana de 5 minutos:** no alcanza ni para firmar con una hardware wallet sin prisa, y casi ningún exchange emite el retiro tan rápido.
- **Revisión manual de los pagos tardíos, como BTCPay:** cada pago desde un exchange terminaría en una cola de soporte.
