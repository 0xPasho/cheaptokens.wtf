# ADR-0031: `reasoning_content` pasa al cliente

- **Estado:** Aceptada. Amplía la lista de campos que pasan de [ADR-0002](./0002-api-compatible-openai.md) y de [04 · API › Response](../04-api.md#response).
- **Fecha:** 2026-11-10
- **Origen:** Default (propuesto en [15 · Plan](../15-plan-gateway.md) y guardado a pedido del dueño)

## Contexto

- [ADR-0002](./0002-api-compatible-openai.md) dice que solo pasan los campos del estándar de OpenAI. Con esa regla, el razonamiento de los modelos se descarta.
- Los modelos de razonamiento de InferHub lo mandan como `reasoning_content`, en `message` y en `delta`. Es el formato que popularizó DeepSeek, y muchas herramientas lo muestran ([ADR-0028](./0028-inferhub-upstream-de-pruebas.md)).
- **El cliente paga esos tokens:** vienen en `completion_tokens`, como `reasoning_tokens`.
- El campo es texto del modelo: no trae costo, ni IDs, ni el nombre del upstream.

## Decisión

- **Pasan `choices[].message.reasoning_content` y `choices[].delta.reasoning_content`**, solo si son string.
- **No pasan otros formatos de razonamiento** (`reasoning`, `reasoning_details`, `thinking` y parecidos). Si un upstream usa otro, se decide con otro ADR si se normaliza a `reasoning_content`.
- `usage.completion_tokens_details.reasoning_tokens` ya pasaba y sigue pasando.
- Como cualquier respuesta, el razonamiento no se guarda ([ADR-0014](./0014-no-guardar-contenido.md)).

## Consecuencias

- Las herramientas que muestran el razonamiento (como las que usa el dueño con InferHub) funcionan contra cheaptokens.wtf sin cambios.
- Los clientes que no conocen el campo lo ignoran: el SDK de OpenAI no falla con campos extra.
- La whitelist de `sanitize.ts` tiene una entrada más, con su prueba.
- Si algún día un razonamiento menciona al upstream, sería texto del modelo, igual que en `content`. No se filtra.

## Alternativas descartadas

- **Descartarlo, como decía ADR-0002:** el cliente pagaría tokens que no puede ver, y se romperían las herramientas que lo muestran.
- **Normalizar todos los formatos de razonamiento a uno solo:** hoy solo hay un upstream y usa `reasoning_content`. Normalizar sin un segundo caso real es adivinar.
