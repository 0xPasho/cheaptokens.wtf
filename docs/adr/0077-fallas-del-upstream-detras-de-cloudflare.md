# ADR-0077: Las fallas del upstream responden 503 y el upstream tiene 45 s para empezar un stream

- **Estado:** Aceptada. Cambia los códigos de `upstream_error` y `upstream_timeout` de [04 · API › Errores](../04-api.md#errores) y el timeout de conexión de [03 · Arquitectura › Timeouts](../03-arquitectura.md#timeouts). Reemplaza el `502 upstream_error` que [ADR-0071](./0071-pagina-como-funciona.md) muestra en Cómo funciona.
- **Fecha:** 2026-11-24
- **Origen:** Usuario (que Deska muestre el error real y que el upstream tenga 45 s) + Default (503 para las tres fallas del upstream)

## Contexto

- Deska Harness mostraba "Error 504: Gateway time-out" y "Error 502: Bad gateway" de Cloudflare, como si el servidor estuviera caído. El 23 y el 24 de noviembre, cada uno de esos errores fue en realidad una respuesta del gateway: `502 upstream_error` cuando InferHub contestó `429 capacity_saturated` o `503 no_capacity`, y `504 upstream_timeout` cuando no mandó headers en 10 s.
- **Cloudflare reemplaza un 502 o un 504 del origen por su propio error.** nginx registró el JSON del gateway (504, 136 bytes) y el cliente recibió el `problem+json` de Cloudflare (`origin_gateway_timeout`). La documentación de Cloudflare lo dice ("Cloudflare returns a Cloudflare-branded HTTP 502 or 504 error when your origin web server responds with a standard HTTP 502 … or 504") y no ofrece una forma de dejar pasar el body. Un 503 del origen pasa tal cual.
- **El timeout de 10 s no era de conexión.** Corre hasta los headers del upstream, e InferHub los manda junto con el primer token: en una prueba del 2026-11-24, Sonnet 4.6 mandó headers y primer evento en el mismo milisegundo (~2 s con 16.7k tokens de entrada). Cuando InferHub se pone lento, 10 s corta requests que habrían respondido.

## Decisión

- **`upstream_error`, `upstream_timeout` y `no_upstream_available` responden `503`.** El `code` del body sigue distinguiéndolos. El cliente recibe el JSON del gateway, con su `code` y su mensaje.
- **El upstream tiene 45 s para mandar headers en un stream** (`connectMs` en `src/lib/gateway/upstream-fetch.ts`). El primer byte sigue en 60 s, y en 180 s para modelos `reasoning`.
- El registro de `requests` guarda `http_status = 503` desde ahora. Los registros anteriores conservan 502 y 504.

## Consecuencias

- Deska y cualquier cliente ven "The model timed out…" o "The model failed…" con su `code`, en vez de un error de Cloudflare que culpa al servidor.
- Los SDK compatibles con OpenAI reintentan un 503 igual que un 502 o un 504. Pi (Deska Harness) también: su lista de errores reintentables incluye `503` y `timeout`.
- Un cliente que distinguía las fallas por status (502 contra 504) ahora tiene que leer `error.code`.
- Un stream que falla por timeout tarda hasta 45 s en lugar de 10 s. Pi reintenta 3 veces, así que un upstream caído tarda unos 3 minutos en mostrar el error.
- **Vigilar los 100 s de Cloudflare:** el gateway no manda nada al cliente hasta que un upstream responde. Con un solo upstream, el peor caso son 45 s. Con dos upstreams colgados, unos 90 s. Con tres, Cloudflare corta a los 100 s con un `524`, que también tapa al gateway.

## Alternativas descartadas

- **Seguir con 502 y 504:** Cloudflare los reemplaza y el cliente nunca ve el error del gateway.
- **Una regla de Cloudflare (Custom Error Rules):** reemplaza el body por uno fijo, no deja pasar el del origen, y pide un plan de pago.
- **Sacar `api.cheapllm.wtf` del proxy de Cloudflare:** pierde la protección de la zona y expone la IP del servidor, que comparte con otras apps.
- **`500` para `upstream_error`:** la documentación de Cloudflare no dice con claridad si deja pasar un 500 del origen. El 503 está documentado como del origen.
- **30 s:** el usuario eligió 45 s para dejar más margen a InferHub, sin pasar el primer byte de 60 s.
