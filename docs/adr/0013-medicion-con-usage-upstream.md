# ADR-0013: Medir con el `usage` del upstream y drenar el stream al cancelar

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

Cobramos por token y el upstream nos cobra por token. Hay que saber cuántos tokens hubo en cada request, también cuando el cliente cancela el stream a la mitad. Si contáramos con nuestro propio tokenizer, nuestra cuenta podría diferir de la del upstream.

## Decisión

- **Fuente de los tokens: el `usage` que reporta el upstream.** Requisito para aceptar un upstream ([07 · Upstreams](../07-upstreams.md#requisitos-para-aceptar-un-upstream)).
- **En streaming** siempre se fuerza `stream_options.include_usage = true` hacia el upstream. El chunk final con `usage` solo se reenvía si el cliente lo pidió.
- **Si el cliente se desconecta,** el gateway sigue leyendo el stream del upstream hasta el final (sin escribir al cliente), registrado con `after()` y dentro de `maxDuration`. Así obtiene el `usage` y cobra lo que el upstream nos cobra.
- **Si no llega `usage`** (el upstream cortó o venció `maxDuration`), se estima: input ≈ caracteres del prompt / 4 y output ≈ caracteres generados / 4. El request se marca con `usage_estimated = true`.

## Consecuencias

- Lo que cobramos coincide con lo que nos cobran, y la conciliación por upstream es posible.
- **Al cancelar, el cliente paga lo generado hasta el final,** no solo lo que alcanzó a recibir. Es coherente con nuestro costo, pero hay que explicarlo en `/docs`.
- Drenar streams cancelados consume tiempo de función. Es un costo que hay que medir.
- Las estimaciones deben ser raras. Si un upstream produce muchas, se investiga o se saca.

## Alternativas descartadas

- **Tokenizer propio:** cada familia de modelos tiene su tokenizer, algunos no son públicos, y la cuenta divergiría de lo que cobra el upstream.
- **Abortar el upstream cuando el cliente cancela:** solo ahorra si el upstream deja de cobrarnos al abortar, y no lo sabemos. Si nos cobra igual, perdemos lo generado y ni siquiera sabemos cuánto fue. Se puede reconsiderar por upstream si alguno confirma que corta la facturación al abortar.
- **Cobrar solo lo que el cliente recibió:** pérdida directa en cada cancelación.
