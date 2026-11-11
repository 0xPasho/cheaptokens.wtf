# ADR-0026: La marca es `cheaptokens.wtf`, con la web en `cheaptokens.wtf` y la API en `api.cheaptokens.wtf`

- **Estado:** Aceptada. Reemplaza a [ADR-0021](./0021-dominios.md).
- **Fecha:** 2026-11-10
- **Origen:** Usuario (nombre, dominio y nombre completo como wordmark) + Default (subdominio para la API, que viene de ADR-0021, y reglas de escritura)

## Contexto

- El nombre de trabajo era "Deska Router", con un dominio temporal ([ADR-0021](./0021-dominios.md)). Deska es otro proyecto del mismo dueño, y este necesita una marca propia ([12 · pregunta 9](../12-preguntas-abiertas.md)).
- El criterio del dueño: que el dominio solo ya diga qué hace el producto (un endpoint, cualquier modelo, más barato) y que el nombre salga de lo común.
- El dominio tiene que quedar fijo antes del lanzamiento público. Después, cada cambio deja un alias de API para siempre (ADR-0021).

## Decisión

- **Nombre y marca:** `cheaptokens.wtf`. Se escribe siempre completo, en minúsculas y con el `.wtf`, también al empezar una oración. Nunca "CheapTokens", "Cheap Tokens" ni "cheaptokens" sin el TLD.
- **Wordmark:** el nombre completo es el logo. Es texto en `font-heading font-semibold`, sin símbolo gráfico ([13 · Sistema de diseño](../13-sistema-de-diseno.md#tipografía)).
- **Web:** `https://cheaptokens.wtf` (con `/en/…` y `/es/…`).
- **API:** `https://api.cheaptokens.wtf/v1`.
- **Lo demás de ADR-0021 se mantiene:**
  - Los dos hosts apuntan al mismo proyecto de Vercel. El gateway **solo acepta requests en el host de la API** (lista en la env var `API_HOSTS`, más los hosts de preview y `localhost` en desarrollo). En el host web, `/v1/*` responde `404` con un mensaje que indica el host correcto.
  - El `proxy.ts` (i18n + Clerk) solo actúa en el host web.
  - **La API no habilita CORS en el MVP:** una API key en el navegador es una key filtrada.
  - Si el dominio cambia después del lanzamiento, el host viejo de la API **se queda como alias permanente que sigue sirviendo tráfico, sin redirigir**.
- **Lo que se nombra a partir de la marca:**
  - El precio que cobramos se llama "precio cheaptokens.wtf" en los docs y en la UI.
  - La env var de los ejemplos es `CHEAPTOKENS_API_KEY`.
  - Las API keys empiezan con `wtf_` ([ADR-0027](./0027-formato-api-keys-wtf.md)).
  - En el código, los identificadores son neutros (`discountedInput`, `discountedOutput`, la prop `discounted` de `PriceComparison`). Así, otro cambio de nombre no toca el código.

## Consecuencias

- El dominio temporal nunca se lanzó, así que no queda ningún alias que mantener.
- **Hay que registrar `cheaptokens.wtf`** antes de anunciar el nombre y de configurarlo en Vercel y en Clerk. El 2026-11-10 estaba libre: el RDAP del registro de `.wtf` respondía 404 y no tenía DNS.
- **`.wtf` no está en la lista de HSTS precargado**, a diferencia de `.dev` (verificado en la lista de Chromium el 2026-11-10). La web tiene que mandar su propio header `Strict-Transport-Security`, y se puede pedir el preload en hstspreload.org. Para la API no cambia nada: los SDKs no usan esa lista, y la base URL que documentamos ya es `https://`.
- **El nombre es informal a propósito:** le habla a devs que buscan precio. Puede restar con compradores corporativos, y hay filtros de red que desconfían de los gTLD nuevos. Si aparecen clientes bloqueados, un host de API extra en otro TLD funciona como alias sin afectar a los demás.
- La marca y el dominio son lo mismo: no se puede cambiar el dominio sin cambiar la marca.

## Alternativas descartadas

- **Seguir con "Deska Router" y su dominio temporal:** ata el producto a Deska.
- **`chiptokens.wtf`:** el juego de palabras con *chip* hay que explicarlo, y el dominio deja de decir "barato", que es lo que hace el producto.
- **Nombres con un competidor activo** (verificado el 2026-11-10): Cheap Router (`cheaprouter.dev`, `router.cheap`), Cheap LLM (`cheapllm.ai`), LLM Outlet (`llmoutlet.dev`), Every Model (`everymodel.ai`) y Any Model (`anymodel.dev`).
- **El TLD `.cheap`:** hay un competidor en `router.cheap`, y `tokens.cheap` vende cuentas de Discord.
