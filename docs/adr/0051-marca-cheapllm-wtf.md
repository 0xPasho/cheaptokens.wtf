# ADR-0051: La marca es `cheapllm.wtf`, con la web en `cheapllm.wtf` y la API en `api.cheapllm.wtf`

- **Estado:** Aceptada. Reemplaza a [ADR-0026](./0026-marca-cheaptokens-wtf.md).
- **Fecha:** 2026-11-17
- **Origen:** Usuario

## Contexto

- [ADR-0026](./0026-marca-cheaptokens-wtf.md) eligió `cheaptokens.wtf` y dejó pendiente registrarlo ([12 · pregunta 4](../12-preguntas-abiertas.md#4-registrar-cheapllmwtf)). Antes de que lo registráramos, lo registró un tercero. El dominio ya no se puede usar.
- Como la marca y el dominio son lo mismo (ADR-0026), perder el dominio obliga a cambiar la marca.
- El producto todavía no se lanzó: no hay clientes, keys ni integraciones que apunten al host viejo.
- `cheapllm.wtf` estaba libre: el RDAP del registro de `.wtf` respondía 404 el 2026-11-17.

## Decisión

- **Nombre y marca:** `cheapllm.wtf`. Se escribe con las mismas reglas que ADR-0026: siempre completo, en minúsculas y con el `.wtf`, también al empezar una oración. Nunca "CheapLLM", "Cheap LLM" ni "cheapllm" sin el TLD.
- **Web:** `https://cheapllm.wtf` (con `/en/…` y `/es/…`).
- **API:** `https://api.cheapllm.wtf/v1`.
- **Env var de los ejemplos:** `CHEAPLLM_API_KEY`.
- **El precio que cobramos** se llama "precio cheapllm.wtf" en los docs y en la UI.
- **Lo demás de ADR-0026 se mantiene:** el wordmark es el nombre completo en texto, los dos hosts apuntan al mismo proyecto de Vercel, el gateway solo acepta requests en el host de la API (`API_HOSTS`), `proxy.ts` solo actúa en el host web, la API no habilita CORS, los identificadores del código son neutros y, si el dominio cambia después del lanzamiento, el host viejo de la API queda como alias permanente.

## Consecuencias

- **El prefijo `wtf_` de [ADR-0027](./0027-formato-api-keys-wtf.md) sigue valiendo**, porque el TLD no cambia. ADR-0027 no se reemplaza.
- **No hay alias que mantener:** el producto no se lanzó, y `cheaptokens.wtf` ya no es nuestro, así que no podría servir de alias ni de redirección.
- **"LLM" es el término que buscan los devs.** El dominio sigue diciendo qué hace el producto: LLMs baratos.
- **Riesgo: usuarios que escriban el dominio viejo de memoria** (por ejemplo, quien vio el nombre antes del cambio) llegan a un sitio de otro dueño. Se puede registrar `cheaptokens.lol` como defensa, aunque no cubre el `.wtf`.
- **Riesgo de confusión con Cheap LLM (`cheapllm.ai`)**, que ADR-0026 descartó por tener un competidor activo. Hay que vigilarlo: si genera confusión real o un reclamo de marca, se revisa este ADR.
- **Hay que registrar `cheapllm.wtf` ya**, antes de anunciar el nombre y de configurarlo en Vercel y en Clerk. Es la misma lección que llevó a este ADR.
- **Sigue sin haber HSTS precargado para `.wtf`** (ADR-0026): la web manda su propio header `Strict-Transport-Security`.

## Alternativas descartadas

- **`cheaptokens.lol`:** el tráfico de quien escriba `cheaptokens.wtf` se va a quien tenga ese dominio, y dos marcas casi iguales confunden.
- **`peanuts.wtf`:** es un nombre de marca que no explica el producto, justo lo contrario del criterio de ADR-0026.
- **`dirtcheaptokens.wtf` y `peanuttokens.wtf`:** más largos de escribir y de recordar.
