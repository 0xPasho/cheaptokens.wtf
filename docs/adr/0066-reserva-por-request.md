# ADR-0066: Cada request reserva su costo máximo antes de llamar al upstream

- **Estado:** Aceptada. Reemplaza «Los créditos pueden quedar levemente negativos» y el acotamiento de lo absorbido de [ADR-0049](./0049-suscripcion-con-limites.md), y la reserva previa descartada en [ADR-0008](./0008-creditos-prepagados.md). La salida por defecto la cambió [ADR-0067](./0067-salida-maxima-por-modelo.md): es la máxima de cada modelo, y la sincronización llena `models.max_output_tokens`.
- **Fecha:** 2026-11-19
- **Origen:** Usuario (salió de una revisión de seguridad)

## Contexto

- La admisión solo preguntaba si quedaba algo: plan con límite, paquete o saldo positivo. El costo se cobraba al terminar el request, que puede durar hasta 790 s.
- Nada acotaba un request: sin tope de `max_tokens` y con un prompt de hasta 4,5 MB (cerca de un millón de tokens con contexto de 1M).
- La exposición que ADR-0008 y ADR-0049 aceptaban era «requests en vuelo × costo máximo de un request», pensando en centavos por request. Sin topes, ese máximo eran dólares por request.
- Resultado medido en la revisión: un plan Plus de $9 a 60 req/min podía admitir cientos de requests de un millón de tokens antes de que llegara el primer cobro. Todo lo que pasara del límite iba a `absorbed_micro_usd`, que es pérdida directa, o a un saldo negativo de una cuenta que se puede abandonar. Lo mismo pasaba con el tope de excedente y el límite de gasto de una key.
- ADR-0008 descartó la reserva previa por tres razones: estimar el input, manejar los `max_tokens` ausentes y liberar las reservas huérfanas cuando una función muere.

## Decisión

- **Costo máximo de un request,** calculado antes de llamar al upstream (`src/lib/gateway/request-cost.ts`):
  - **Prompt:** todo el body cuenta (mensajes, tools, `response_format`…) a 3 bytes por token, hacia arriba. Cada imagen reserva 2 000 tokens en vez de su base64. Nunca más que el contexto del modelo.
  - **Salida:** `max_tokens` o `max_completion_tokens` del cliente, el menor de los dos. Si no manda ninguno, 32 768 o `models.max_output_tokens` cuando se conoce, y ese valor se le manda al upstream como `max_tokens`. Se multiplica por `n`.
  - **Precio por token:** el más alto con que se puede cobrar. Es el del catálogo o el tope de costo de cualquiera de sus upstreams con el margen de ADR-0054, porque el fallback puede terminar en cualquiera.
- **Presupuesto:** lo que queda del plan, más el paquete y los créditos que la key puede usar, con los créditos de excedente acotados por lo que queda del tope del mes (`admissionBudget`). A eso se le restan las reservas de los requests en curso del mismo workspace. Si la key tiene límite de gasto, se aplica lo mismo con lo que le queda.
- **Si la salida pedida no cabe,** se recorta a lo que alcanza y el upstream recibe el `max_tokens` recortado, en el mismo campo que mandó el cliente. El cliente lo ve como `finish_reason: "length"`. Nunca se recorta por debajo de 1 024 tokens, ni por debajo de lo que pidió si pidió menos: en ese caso se rechaza.
- **Si no cabe ni el mínimo,** se rechaza con el código de siempre (`usage_limit_reached`, `insufficient_credits` o `key_limit_exceeded`) y un mensaje que dice que baje `max_tokens` o el prompt, o que espere a que terminen los requests en curso. El upstream no se llama ni se registra nada.
- **Reservas en memoria y por instancia** (`src/lib/gateway/holds.ts`), igual que el rate limiter y la rotación de cuentas. Se reserva al admitir y se libera cuando el cobro ya está en la base. Si el proceso muere, sus requests mueren con él: no quedan reservas huérfanas, que era la tercera objeción de ADR-0008.
- **Sin carrera entre la lectura y el cobro:** el handler marca el libro antes de leer saldos. Lo que se libere después de esa marca sigue contando para ese request, porque la base que leyó todavía no tenía ese cobro.
- **`max_tokens`, `max_completion_tokens` y `n` se validan en el gateway:** enteros positivos o `null`. Antes los validaba el upstream.

## Consecuencias

- La pérdida por request queda acotada por lo que el upstream cobre por encima de la estimación. Pasa, por ejemplo, con vendedores que reportan más tokens de salida que el `max_tokens` pedido (docs/07). Ya no depende de cuántos requests haya en vuelo.
- El último request de una ventana ya no puede cruzar el límite: si su costo máximo no cabe, se recorta o se rechaza. El plan se siente un poco más chico al final de cada ventana. La estimación del prompt, a 3 bytes por token, sobreestima el texto en inglés cerca de un 33 %.
- **Concurrencia acotada por dinero:** en un plan chico con un modelo caro, los requests largos en paralelo esperan su turno. Por ejemplo, en Plus con un modelo de frontera sin `max_tokens` cabe uno o dos a la vez. Los requests secuenciales no cambian.
- Un cliente sin `max_tokens` ahora recibe como máximo 32 768 tokens de salida, o lo que alcance. Si un modelo rechaza ese valor por pasar su máximo, se fija `models.max_output_tokens` para ese modelo. `catalog:sync` no lo toca.
- **Con varias instancias,** cada una reserva solo lo suyo, y la exposición se multiplica por el número de instancias. Hoy hay una (pm2 en modo fork, ADR-0059). Si se escala, las reservas pasan a Redis junto con el rate limiter (ADR-0017).
- Una admisión cuyo plan no cubre el costo máximo hace las mismas queries que antes: paquetes y excedente de socio. Una que sí lo cubre no hace ninguna extra.

## Alternativas descartadas

- **Reservar en la base** (una columna `reserved_micro_usd`): sobrevive a varias instancias, pero vuelve el problema de las reservas huérfanas cuando el proceso muere a mitad de un request, y agrega una escritura por request.
- **Solo limitar los requests en paralelo:** baja la exposición, pero no la acota. Un solo request de un millón de tokens ya cuesta más que la ventana de un plan chico.
- **Rechazar en vez de recortar `max_tokens`:** más explícito, pero obliga a cada cliente a calcular su `max_tokens` según el saldo. Recortar da una respuesta útil con la señal estándar `finish_reason: "length"`.
- **No mandar `max_tokens` cuando el cliente no lo fija:** evita que un modelo con salida máxima menor lo rechace, pero deja la salida, y con ella la pérdida, sin tope.
- **Estimar el prompt con caracteres ÷ 4 del texto de los mensajes,** como la estimación de cobro de ADR-0013: ignora tools, argumentos de tool calls y texto CJK, y un cliente podría esconder ahí un prompt enorme.
