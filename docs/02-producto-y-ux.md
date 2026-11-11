# 02 · Producto y UX

La regla es simple: **cada pantalla sirve para un solo trabajo.** Si algo no ayuda a hacer el primer request, a entender el precio o a controlar el gasto, no va en el MVP.

## Mapa de páginas

Todas las páginas web viven en `cheaptokens.wtf` y llevan el idioma en la ruta ([10 · i18n](./10-i18n.md)). La API vive en su propio host y no lleva idioma.

| Ruta | Acceso | Trabajo que resuelve |
|---|---|---|
| `/[lang]` | Pública | Entender qué es y registrarse |
| `/[lang]/models` | Pública | Ver modelos, precios y descuentos |
| `/[lang]/docs` | Pública | Conectar en 1 minuto |
| `/[lang]/sign-in`, `/[lang]/sign-up` | Pública | Login y registro con Clerk |
| `/[lang]/terms`, `/[lang]/privacy` | Pública | Términos (rol de intermediario y uso aceptable) y aviso de privacidad ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)) |
| `/[lang]/dashboard` | Privada | Ver saldo y empezar |
| `/[lang]/dashboard/keys` | Privada | Crear y revocar API keys |
| `/[lang]/dashboard/credits` | Privada | Recargar e historial de pagos |
| `/[lang]/dashboard/usage` | Privada | Ver qué se gastó y cuánto se ahorró |
| `/[lang]/design-system` | Interna | Referencia de átomos de UI |
| `api.cheaptokens.wtf/v1/*` | API key | El gateway, en su propio host ([04 · API](./04-api.md), [ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)) |

## Landing (`/[lang]`)

Arriba del pliegue van tres cosas:

1. **Una frase:** "One endpoint. Every model. Up to 90% off." / "Un endpoint. Todos los modelos. Hasta 90% menos."
2. **El snippet** que muestra que solo cambian dos líneas:
   ```python
   client = OpenAI(
       base_url="https://api.cheaptokens.wtf/v1",
       api_key="wtf_...",
   )
   ```
3. **CTA:** "Get your API key" / "Obtén tu API key" → registro.

Debajo: una vista previa del catálogo (5–6 modelos populares con el precio oficial tachado y el precio cheaptokens.wtf) y un link a `/models`.

## Catálogo (`/[lang]/models`)

Es la página de venta y debe funcionar sin login.

- **Una tabla con una fila por modelo:**
  - Nombre y autor, con el ID copiable (`anthropic/claude-haiku-4.5`).
  - Tags como chips.
  - Contexto (por ejemplo "200K").
  - Input / 1M: ~~$3.00~~ **$0.30**.
  - Output / 1M: ~~$15.00~~ **$1.50**.
  - Badge de descuento: **−90%**.
- **Filtros:** chips por tag (se pueden combinar) y búsqueda por nombre o autor.
- **Orden:** por descuento, precio de output o nombre.
- **Precios por 1M de tokens.** El precio por token es ilegible ($0.0000003), así que solo aparece en un tooltip.
- **Origen del precio oficial:** un tooltip con el link a la página de precios del autor y la fecha en que se verificó.
- **Modelos `deprecated`:** se muestran con un badge y la fecha de retiro.

Los IDs, tags y la regla del precio se definen en [06 · Catálogo y precios](./06-catalogo-y-precios.md).

## Dashboard: inicio (`/[lang]/dashboard`)

- **Saldo** grande y botón **Recargar**.
- **Checklist de 3 pasos** mientras el usuario no haya hecho su primer request:
  1. Recarga créditos.
  2. Crea una API key.
  3. Copia este snippet (en Python, JS y curl, con la base URL ya puesta).
- Cuando ya hay uso, el checklist se reemplaza por los **totales del mes**: gasto, ahorro frente al precio oficial y número de requests.
- **Aviso de saldo bajo** cuando quedan menos de $2 (umbral configurable).

## API keys (`/[lang]/dashboard/keys`)

- **Lista** con nombre, hint (`wtf_Ab3x…9kQz`), fecha de creación, último uso, gastado, límite y acción **Revocar** (con confirmación).
- **Crear key:** nombre (obligatorio) y límite de gasto en USD (opcional). Se abre un modal que muestra la key **una sola vez**, con botón de copiar, el aviso "No la volverás a ver" y el snippet con la key ya puesta.
- Detalle técnico en [05 · API keys](./05-api-keys.md).

## Créditos (`/[lang]/dashboard/credits`)

- Saldo actual.
- Montos rápidos ($10, $25, $50, $100) y monto libre ($10–$1,000). El botón lleva al checkout del Merchant of Record, que agrega ahí el impuesto de cada país, y al volver se confirma con el saldo ya actualizado.
- Historial de recargas: fecha, monto, estado y link al recibo del MoR.
- Detalle en [08 · Créditos y pagos](./08-creditos-y-pagos.md).

## Uso (`/[lang]/dashboard/usage`)

- **Totales del mes:** gasto, ahorro frente al precio oficial y requests.
- **Tabla paginada de requests:** fecha, modelo, key, tokens in/out, costo, ahorro, latencia y estado.
- **Filtros:** por key, modelo y rango de fechas.
- No hay contenido de prompts, porque no lo guardamos ([ADR-0014](./adr/0014-no-guardar-contenido.md)).

## Docs (`/[lang]/docs`)

Una sola página, en este orden: base URL, autenticación, ejemplo en curl, Python y JS/TS, streaming, cómo elegir modelo (link a `/models`), tabla de errores y herramientas compatibles. El contenido sale de [04 · API](./04-api.md).

## Estados vacíos y errores

| Situación | Qué ve el usuario |
|---|---|
| Sin keys | "No API keys yet." + botón "Create key" |
| Sin uso | "No requests yet." + el snippet |
| Saldo en cero | Banner: "Your balance is $0. Requests will fail with 402." + Recargar |
| Saldo negativo | Banner: "Your balance is −$0.12. Top up to keep using the API." |
| Pago fallido | Se vuelve a `/credits` con "Payment didn't go through. You weren't charged." |

El copy final se escribe y se traduce en los diccionarios ([10 · i18n](./10-i18n.md)).

## Selector de idioma

Está en el footer y en el menú de usuario. Cambia el prefijo de la ruta y guarda la preferencia en una cookie.

## UI

Las reglas visuales (color, tema, tipografía, formatos y componentes) están en [13 · Sistema de diseño](./13-sistema-de-diseno.md). La referencia viva es `/design-system`.

- Átomos de shadcn/ui (`base-nova` sobre Base UI) y solo tokens semánticos de color, según [AGENTS.md](../AGENTS.md).
- Montos con números tabulares (`tabular-nums`) para que las columnas de precios se alineen.
- Dark mode desde el inicio, con `system` como default.
