<div align="center">

<h1>cheapllm.wtf</h1>

<p><b>Una URL para todos los modelos de IA, por menos.</b></p>

<p>Gateway compatible con la API de OpenAI. Pides un modelo, el request va por la ruta más barata<br>
de ese momento y se cobra lo que costó, nunca más que el precio publicado.</p>

<p>
<img alt="API: compatible con OpenAI" src="https://img.shields.io/badge/API-compatible%20con%20OpenAI-262626?style=flat-square&labelColor=0d0d0d&logo=openai&logoColor=white"> <img alt="Pagos: USDC · Bitcoin" src="https://img.shields.io/badge/Pagos-USDC%20%C2%B7%20Bitcoin-262626?style=flat-square&labelColor=0d0d0d&logo=bitcoin&logoColor=white"> <img alt="Prompts: no se guardan" src="https://img.shields.io/badge/Prompts-no%20se%20guardan-262626?style=flat-square&labelColor=0d0d0d"> <img alt="Idiomas: español · English" src="https://img.shields.io/badge/Idiomas-espa%C3%B1ol%20%C2%B7%20English-262626?style=flat-square&labelColor=0d0d0d">
</p>

<p>
<a href="https://cheapllm.wtf"><b>Sitio</b></a> &nbsp;·&nbsp;
<a href="https://cheapllm.wtf/es/pricing">Precios</a> &nbsp;·&nbsp;
<a href="https://cheapllm.wtf/es/docs">API</a> &nbsp;·&nbsp;
<a href="./docs/README.md">Documentación</a> &nbsp;·&nbsp;
<a href="./docs/adr/README.md">Decisiones</a>
</p>

<br>

<img src="./docs/screenshots/portada.jpg" alt="La portada de cheapllm.wtf: el precio oficial tachado junto al nuestro" width="100%">

<br><br>

<p><sub>LOS MODELOS DE</sub></p>

<p>
<picture><source media="(prefers-color-scheme: dark)" srcset="./docs/readme/logos/anthropic-dark.svg"><img src="./docs/readme/logos/anthropic-light.svg" alt="Anthropic" title="Anthropic" width="28" height="28"></picture>&emsp;<picture><source media="(prefers-color-scheme: dark)" srcset="./docs/readme/logos/openai-dark.svg"><img src="./docs/readme/logos/openai-light.svg" alt="OpenAI" title="OpenAI" width="28" height="28"></picture>&emsp;<img src="./docs/readme/logos/gemini-color.svg" alt="Google" title="Google" width="28" height="28">&emsp;<img src="./docs/readme/logos/deepseek-color.svg" alt="DeepSeek" title="DeepSeek" width="28" height="28">&emsp;<img src="./docs/readme/logos/meta-color.svg" alt="Meta" title="Meta" width="28" height="28">&emsp;<img src="./docs/readme/logos/qwen-color.svg" alt="Qwen" title="Qwen" width="28" height="28">&emsp;<picture><source media="(prefers-color-scheme: dark)" srcset="./docs/readme/logos/xai-dark.svg"><img src="./docs/readme/logos/xai-light.svg" alt="xAI" title="xAI" width="28" height="28"></picture>&emsp;<picture><source media="(prefers-color-scheme: dark)" srcset="./docs/readme/logos/kimi-dark.svg"><img src="./docs/readme/logos/kimi-light.svg" alt="Moonshot AI" title="Moonshot AI" width="28" height="28"></picture>&emsp;<img src="./docs/readme/logos/minimax-color.svg" alt="MiniMax" title="MiniMax" width="28" height="28">&emsp;<img src="./docs/readme/logos/mistral-color.svg" alt="Mistral AI" title="Mistral AI" width="28" height="28">&emsp;<picture><source media="(prefers-color-scheme: dark)" srcset="./docs/readme/logos/zai-dark.svg"><img src="./docs/readme/logos/zai-light.svg" alt="Z.ai" title="Z.ai" width="28" height="28"></picture>&emsp;<img src="./docs/readme/logos/xiaomi-color.svg" alt="Xiaomi" title="Xiaomi" width="28" height="28">
</p>

</div>

<br>

## Qué hace

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>Compatible con OpenAI</h3>
      Cambias la URL base y la key. El SDK, las herramientas y el streaming siguen igual.
    </td>
    <td width="33%" valign="top">
      <h3>El precio es un tope</h3>
      Cada request se cobra a lo que costó de verdad. Si el costo baja, pagas menos. Si falla, no pagas.
    </td>
    <td width="33%" valign="top">
      <h3>La ruta más barata</h3>
      El mismo modelo se sirve a distintos precios. Los precios se revisan cada minuto y, si una ruta falla, se reintenta sola.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <h3>Plan, créditos o los dos</h3>
      Planes con un límite cada 5 horas y otro semanal, o créditos por uso que no vencen. Una sola key.
    </td>
    <td width="33%" valign="top">
      <h3>Sin tarjeta</h3>
      Se paga con USDC en Solana o en Base, o con Bitcoin. Sin cobros automáticos ni contracargos.
    </td>
    <td width="33%" valign="top">
      <h3>Sin guardar contenido</h3>
      De cada request queda el modelo, los tokens, el costo y la hora. Nunca los mensajes ni la respuesta.
    </td>
  </tr>
</table>

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.cheapllm.wtf/v1",  # antes: https://api.openai.com/v1
    api_key="wtf_...",
)
```

## Cómo viaja un request

```mermaid
sequenceDiagram
    autonumber
    participant App as Tu app
    participant GW as api.cheapllm.wtf
    participant M as El modelo
    App->>GW: POST /v1/chat/completions
    GW->>GW: Revisa la key y reserva el máximo
    GW->>M: La ruta más barata (hasta 3 intentos)
    M-->>GW: Respuesta, de una vez o en streaming
    GW-->>App: Respuesta
    GW->>GW: Cobra lo que costó
```

Si algo no cuadra antes de llamar al modelo (key, saldo o ruta), el request se detiene con su error y cuesta cero. El detalle de cada paso está en [docs/04 · API](./docs/04-api.md) y en la página [Cómo funciona](https://cheapllm.wtf/es/how-it-works).

## El producto

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="./docs/screenshots/precios.jpg" alt="Planes Plus, Pro y Max junto a Créditos">
      <br><b>Precios</b><br>
      <sub>Los planes junto a Créditos, con las requests típicas que caben según el modelo.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="./docs/screenshots/como-se-cobra.jpg" alt="Siete cuadros que explican cómo se cobra">
      <br><b>Cómo se cobra</b><br>
      <sub>Límites, el reparto entre plan y créditos, el cobro cero si falla y el precio tope.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="./docs/screenshots/como-funciona.jpg" alt="Los seis pasos de un request con su dibujo">
      <br><b>Cómo funciona</b><br>
      <sub>Los seis pasos de un request, de la key al cobro, en un recorrido que avanza con el scroll.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="./docs/screenshots/dashboard.jpg" alt="El inicio del dashboard con los límites del plan y el saldo">
      <br><b>Dashboard</b><br>
      <sub>Los límites del plan, el saldo, el ahorro de la semana y lo que gasta cada modelo.</sub>
    </td>
  </tr>
</table>

<br>

<div align="center">

<img alt="Next.js: 16" src="https://img.shields.io/badge/Next.js-16-262626?style=flat-square&labelColor=0d0d0d&logo=nextdotjs&logoColor=white"> <img alt="React: 19" src="https://img.shields.io/badge/React-19-262626?style=flat-square&labelColor=0d0d0d&logo=react&logoColor=white"> <img alt="TypeScript: estricto" src="https://img.shields.io/badge/TypeScript-estricto-262626?style=flat-square&labelColor=0d0d0d&logo=typescript&logoColor=white"> <img alt="Tailwind CSS: 4" src="https://img.shields.io/badge/Tailwind%20CSS-4-262626?style=flat-square&labelColor=0d0d0d&logo=tailwindcss&logoColor=white"> <img alt="shadcn/ui: base-nova" src="https://img.shields.io/badge/shadcn%2Fui-base--nova-262626?style=flat-square&labelColor=0d0d0d&logo=shadcnui&logoColor=white"> <img alt="Postgres: Drizzle" src="https://img.shields.io/badge/Postgres-Drizzle-262626?style=flat-square&labelColor=0d0d0d&logo=postgresql&logoColor=white"> <img alt="Vitest: unit · gateway" src="https://img.shields.io/badge/Vitest-unit%20%C2%B7%20gateway-262626?style=flat-square&labelColor=0d0d0d&logo=vitest&logoColor=white"> <img alt="pnpm: 9" src="https://img.shields.io/badge/pnpm-9-262626?style=flat-square&labelColor=0d0d0d&logo=pnpm&logoColor=white">

</div>

## Empezar en local

Sin cuentas ni Docker: la base es PGlite y el upstream es el simulado.

```bash
pnpm install
cp .env.example .env.local     # los valores de ejemplo ya funcionan en local

pnpm db:dev                    # terminal 1: Postgres local (PGlite) en 127.0.0.1:5433, datos en .pglite/
pnpm mock:upstream             # terminal 2: upstream simulado en 127.0.0.1:4010

pnpm catalog:sync              # carga catalog/ en la base (db:dev ya aplicó las migraciones)
pnpm dev                       # terminal 3: http://localhost:3000
```

> [!TIP]
> Sin las claves de Clerk, `/es/sign-in` entra en modo de desarrollo: cualquier nombre o correo y cualquier código de seis dígitos. `000000` muestra el error de código incorrecto.

<details>
<summary><b>Probar el gateway con una key</b></summary>

<br>

```bash
pnpm keys:create -- --workspace demo            # imprime la key wtf_ una sola vez
export CHEAPLLM_API_KEY=wtf_...
pnpm credits:grant -- --workspace demo --usd 5 --note "prueba local"

curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $CHEAPLLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen/qwen3.8-flash", "messages": [{"role": "user", "content": "Hola"}]}'

pnpm reconcile                 # saldo y gasto de cada key contra los requests, y gasto por upstream
```

- **Contra InferHub de verdad:** pon `UPSTREAM_INFERHUB_API_KEY` en `.env.local`. InferHub pasa a ser el upstream de prioridad 1 y el mock queda de fallback ([ADR-0028](./docs/adr/0028-inferhub-upstream-de-pruebas.md)).
- **Escenarios del mock:** un campo `x_mock` en el body elige el escenario (`{"x_mock": {"scenario": "error-500"}}`, `cut`, `no-usage`, `hang`…). La lista está en `tests/helpers/mock-upstream.ts`.
- **Interruptor de emergencia:** poner `ops_disabled_at` en `model_upstreams` saca ese upstream en 60 s o menos, y `catalog:sync` no lo revierte ([docs/06](./docs/06-catalogo-y-precios.md#fuente-de-verdad-y-sincronización)).
- `catalog:sync` avisa que no revalidó el catálogo si `INTERNAL_REVALIDATE_SECRET` está vacío; en local es normal. Contra una base que no levantó `db:dev` (Neon), corre antes `pnpm db:migrate`.

</details>

<details>
<summary><b>Scripts</b></summary>

<br>

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo en http://localhost:3000 |
| `pnpm build` | Build de producción |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Genera los tipos de rutas y corre `tsc` |
| `pnpm test` | Pruebas unitarias y de componentes (Vitest) |
| `pnpm test:gateway` | El gateway de punta a punta: handler real, PGlite y el upstream simulado |
| `pnpm test:e2e` | Build y pruebas en Chrome: axe y capturas por sección (Playwright). `test:e2e:update` regenera las capturas |
| `pnpm test:live` | Contra InferHub de verdad, solo con `INFERHUB_LIVE=1` y la key: gasta dinero real. Con `USDC_LIVE=1`, los adaptadores de USDC contra mainnet; solo leen y simulan |
| `pnpm check` | Lint, tipos, pruebas unitarias, pruebas del gateway y build. Se corre antes de dar algo por terminado |

</details>

<details>
<summary><b>Estructura del repo</b></summary>

<br>

```text
src/app/[lang]/        el sitio, el dashboard y /design-system, en español e inglés
src/app/v1/            el gateway compatible con OpenAI
src/components/        componentes de producto; ui/ son los átomos de shadcn
src/lib/               gateway, cobro, catálogo, pagos e i18n
catalog/               el catálogo de modelos y su curaduría
docs/                  producto, arquitectura, diseño y ADRs
tests/                 unit, gateway, e2e y live
```

Los componentes se agregan con `pnpm dlx shadcn@latest add <componente>`. Todos se pueden ver, en claro y en oscuro, en [`/design-system`](http://localhost:3000/design-system).

</details>

## Documentación

| Documento | Qué tiene |
|---|---|
| [**Producto y arquitectura**](./docs/README.md) | Qué es cheapllm.wtf, cómo funciona y por qué se decidió cada cosa |
| [**Decisiones (ADR)**](./docs/adr/README.md) | Las decisiones de arquitectura, una por archivo |
| [**Sistema de diseño**](./docs/13-sistema-de-diseno.md) | Las reglas visuales y cómo se prueban |
| [**Deploy**](./docs/18-deploy.md) | Cómo se despliega |
| [**Convenciones**](./AGENTS.md) | Cómo se escribe el código en este repo |
