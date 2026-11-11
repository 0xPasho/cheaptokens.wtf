# ADR-0002: API pública compatible con OpenAI Chat Completions

- **Estado:** Aceptada. [ADR-0031](./0031-reasoning-content-pasa-al-cliente.md) agregó `reasoning_content` a los campos que pasan.
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

La promesa es "una sola URL para cualquier modelo", y conectarse debe ser trivial. El formato de la API decide qué herramientas funcionan sin cambios. Los upstreams también son compatibles con OpenAI ([ADR-0001](./0001-upstreams-agregadores.md)).

## Decisión

El MVP expone **solo** `POST /v1/chat/completions` (con y sin streaming) y `GET /v1/models`, en formato OpenAI. Los parámetros se reenvían tal cual. En la respuesta se reescriben `id` y `model`, y solo pasan los campos del estándar.

## Consecuencias

- Funcionan el SDK oficial de OpenAI, LangChain, el Vercel AI SDK y los editores que aceptan una base URL de OpenAI, cambiando solo `base_url` y `api_key`.
- No hay traducción de formatos: el gateway es un passthrough con transformación ligera. Menos código y menos bugs.
- **Claude Code no funciona en el MVP**, porque usa el formato de Anthropic (`/v1/messages`). Es probablemente el mayor consumidor de Claude barato, así que es lo primero de la fase 2.
- Funciones exclusivas de un proveedor (por ejemplo, los bloques de caché explícitos de Anthropic) solo están disponibles si el upstream las acepta en formato OpenAI.

## Alternativas descartadas

- **OpenAI + Anthropic `/v1/messages` desde el MVP:** traducir tools, streaming y bloques de contenido entre formatos es un proyecto en sí mismo. Se hace en la fase 2 con el gateway ya probado.
- **Responses API de OpenAI:** menos adoptada en herramientas de terceros y con estado del lado del servidor. Queda para la fase 3.
- **Formato propio:** obliga a cada usuario a aprender algo nuevo y a usar nuestro SDK. Va contra el principio de compatibilidad.
