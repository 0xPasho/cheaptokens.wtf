# ADR-0057: Un upstream puede tener varias cuentas, y el gateway rota entre ellas

- **Estado:** Aceptada. Cambia la configuración de la key de [ADR-0028](./0028-inferhub-upstream-de-pruebas.md): `UPSTREAM_INFERHUB_API_KEY` pasa de una key a una lista. El resto de ese ADR sigue igual.
- **Fecha:** 2026-11-17
- **Origen:** Usuario (que InferHub no dependa de una sola cuenta y que el tráfico se reparta) + Default (el cómo)

## Contexto

- Cada upstream tenía una sola key. Todo el tráfico de cheapllm.wtf salía de una sola cuenta de InferHub.
- Con una cuenta, todo depende de ella: su saldo, su rate limit (1,000 requests por minuto) y que InferHub no la suspenda. Y todo el volumen se ve junto, en un mismo lugar.
- Hoy hay una sola cuenta, pero la lógica tiene que estar lista para cuando haya más.

## Decisión

### Configuración

- **La env var de un upstream (`apiKeyEnv`) admite varias keys**, una por cuenta, separadas por comas, espacios o saltos de línea: `UPSTREAM_INFERHUB_API_KEY=sk-uno,sk-dos`. Una sola key sigue funcionando igual.
- Se quitan las vacías y las repetidas (`readSecretList`, `src/lib/env.ts`). Sin ninguna, el upstream no se usa, igual que antes.
- **Todas son cuentas solo para cheapllm.wtf**, como pedía ADR-0028.
- Cada cuenta se identifica por su posición en la lista, empezando en 1. Es lo único que aparece en los logs (`account`). La key nunca.

### Rotación (`createAccountRotation`, `src/lib/gateway/accounts.ts`)

- **Cada request empieza en la cuenta siguiente a la del anterior**, por upstream. Cada instancia arranca en una cuenta al azar, para que las instancias nuevas no carguen todas la primera.
- El estado vive en memoria, por instancia, igual que el rate limiter. Llega al gateway como `GatewayDeps.accounts`.

### Fallback entre cuentas (`callUpstream`, `src/lib/gateway/select-upstream.ts`)

- **Si la cuenta falla por algo suyo, se prueba la siguiente cuenta del mismo upstream**, y la que falló pasa al final de la rotación durante un rato:

  | Respuesta | ¿Otra cuenta? | Pausa |
  |---|---|---|
  | `429` | Sí | 1 minuto |
  | `401` / `403` | Sí, con la alerta de siempre | 5 minutos |
  | `402` por saldo | Sí, con la alerta crítica de siempre | 5 minutos |
  | `402 no_provider_under_bid`, `404`, `5xx`, red, timeout, stream inválido | No: con otra cuenta sería igual. Se pasa al siguiente upstream | — |
  | `400` / `422` | No: es el request del cliente | — |

- **Una cuenta pausada no se descarta:** va al final. Si todas están pausadas, se siguen probando, de la que se libera antes a la que tarda más. Así una pausa nunca deja un modelo sin servicio.
- **El tope sigue siendo de 3 intentos por request, contando los cambios de cuenta.** Así la latencia de un request que falla no crece con el número de cuentas.
- Cuando se acaban las cuentas de un upstream, o el fallo es del upstream, se pasa al siguiente, como antes.

## Consecuencias

- Una cuenta sin saldo, revocada o en su rate limit deja de cortar el servicio si hay otra.
- El tráfico se reparte entre las cuentas, y el rate limit total crece con cada una.
- **La conciliación sigue siendo por upstream:** Σ `requests.upstream_cost_micro_usd` contra la suma de los dashboards de todas las cuentas. La base no guarda qué cuenta atendió cada request; si hace falta conciliar por cuenta, hay que agregar esa columna.
- La alerta de `402` dice qué cuenta se quedó sin saldo (`account` en el log).
- Con varias instancias, el reparto es parejo en promedio, no exacto: cada instancia rota por su lado.
- Las pausas también son por instancia: una instancia nueva puede volver a probar una cuenta mala una vez antes de pausarla.

## Alternativas descartadas

- **Una env var por cuenta (`UPSTREAM_INFERHUB_API_KEY_2`, `_3`…):** obliga a saber cuántas hay y a leer nombres que el catálogo no declara. La lista en una variable es igual de fácil de editar en Vercel.
- **Elegir la cuenta al azar en cada request:** reparte peor con poco tráfico. La rotación con inicio al azar reparte parejo sin coordinar instancias.
- **Guardar la rotación y las pausas en la base o en Upstash:** una escritura más por request para un reparto que no necesita ser exacto.
- **Reintentar con otra cuenta ante cualquier fallo:** un `5xx`, un timeout o la falta de vendedor bajo el tope no dependen de la cuenta; solo gastarían intentos.
- **Que los cambios de cuenta no cuenten en el tope de 3:** con muchas cuentas malas, un request podría tardar mucho en fallar.
