# 02 · Producto y UX

La regla es simple: **cada pantalla sirve para un solo trabajo.** Si algo no ayuda a hacer el primer request, a entender el precio o a controlar el gasto, no va en el MVP.

## Mapa de páginas

Todas las páginas web viven en `cheapllm.wtf` y llevan el idioma en la ruta ([10 · i18n](./10-i18n.md)). La API vive en su propio host y no lleva idioma.

| Ruta | Acceso | Trabajo que resuelve |
|---|---|---|
| `/[lang]` | Pública | Entender qué es, cómo funciona y cuánto cuesta, y llegar a la key o a los modelos ([ADR-0060](./adr/0060-landing-explica-el-producto.md)) |
| `/[lang]/models` | Pública | Ver modelos, precios y descuentos |
| `/[lang]/pricing` | Pública | Elegir entre plan y créditos con números: lo que gasta cada modelo y cómo pagar ([ADR-0061](./adr/0061-paginas-de-precios-y-preguntas.md)) |
| `/[lang]/faq` | Pública | Resolver las dudas de producto, cobro, planes, pagos, API y privacidad ([ADR-0061](./adr/0061-paginas-de-precios-y-preguntas.md)) |
| `/[lang]/docs` | Pública | Conectar en 1 minuto |
| `/[lang]/sign-in`, `/[lang]/sign-up` | Pública | Entrar o crear cuenta en la misma ventana, con un código por correo ([ADR-0063](./adr/0063-una-sola-ventana-de-acceso.md)). En desarrollo, sin Clerk, se entra con un nombre ([ADR-0050](./adr/0050-login-clerk-y-modo-desarrollo.md)) |
| `/[lang]/terms`, `/[lang]/privacy` | Pública | Términos (rol de intermediario y uso aceptable) y aviso de privacidad ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)) |
| `/[lang]/dashboard` | Privada | Ver plan, límites y saldo, y empezar |
| `/[lang]/dashboard/plan` | Privada | Elegir plan, ver límites y decidir qué pasa al llegar al límite |
| `/[lang]/dashboard/credits` | Privada | Agregar créditos con USDC o Bitcoin, e historial de pagos |
| `/[lang]/dashboard/keys` | Privada | Crear, rotar y revocar API keys |
| `/[lang]/dashboard/usage` | Privada | Ver qué se gastó, de dónde se cobró y cuánto se ahorró |
| `/[lang]/dashboard/settings` | Privada | Cuenta, cerrar sesión y exportar datos |
| `/[lang]/design-system` | Interna | Referencia de átomos de UI |
| `api.cheapllm.wtf/v1/*` | API key | El gateway, en su propio host ([04 · API](./04-api.md), [ADR-0051](./adr/0051-marca-cheapllm-wtf.md)) |

## Landing (`/[lang]`)

Explica el producto en ocho secciones, de la que más importa a la que menos ([ADR-0060](./adr/0060-landing-explica-el-producto.md)). Los números salen del catálogo en vivo y de los planes; lo que se promete está acotado por [ADR-0062](./adr/0062-lo-que-el-sitio-promete.md).

1. **Qué es:** "Un endpoint. Todos los modelos. Hasta 90 % menos." (el porcentaje es el mayor descuento del catálogo), una línea de qué es, **Obtén tu API key** y **Ver los N modelos**, y el snippet con las dos líneas que cambian resaltadas.
2. **Precio a la vista:** seis modelos conocidos con el precio oficial tachado, el precio cheapllm.wtf y el descuento. Dice que el precio publicado es el máximo.
3. **Cómo funciona:** tu código → `api.cheapllm.wtf` → el modelo, los tres pasos al primer request y tres garantías.
4. **Vistazo al catálogo:** los grupos de la sidebar de Modelos, por capacidad o por autor, con cuatro tarjetas cada uno y un link a `/models` con el filtro puesto.
5. **Precios:** Plus, Pro y Max junto a Créditos, con las requests típicas según el modelo que se elija; cómo se reparte un request entre plan y créditos; cómo se paga. Link a `/pricing`.
6. **Una key para cada uso:** editor o agente (plan y créditos), producción o CI (solo créditos) y un script o alguien más (solo plan), con las herramientas compatibles.
7. **Preguntas:** siete de `/faq` y un link a todas.
8. **Cierre:** el último llamado al registro.

La cabecera lleva Modelos, Precios, Cómo funciona (`/[lang]#how-it-works`) y Docs. El footer suma Precios y Preguntas frecuentes.

## Precios (`/[lang]/pricing`)

Planes y créditos con el selector de modelo, el reparto entre plan y créditos, la tabla de lo que gasta cada modelo (la misma cuenta que «Consumo por modelo» del dashboard), los pasos para pagar con USDC, la tarjeta de Bitcoin ([ADR-0065](./adr/0065-pagos-en-bitcoin.md)) y cinco preguntas de cobro ([ADR-0061](./adr/0061-paginas-de-precios-y-preguntas.md)).

## Preguntas frecuentes (`/[lang]/faq`)

28 preguntas en seis temas, con los temas a la izquierda y un llamado al registro al final. El texto está en `faq.items` del diccionario y el orden en `FAQ_TOPICS` (`src/lib/marketing.ts`) ([ADR-0061](./adr/0061-paginas-de-precios-y-preguntas.md)).

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

## Iniciar y cerrar sesión

- **Una sola ventana** ([ADR-0063](./adr/0063-una-sola-ventana-de-acceso.md)): escribes tu correo, te llega un código de seis dígitos y entras. Si el correo no tenía cuenta, se crea al verificar el código. `/[lang]/sign-in` y `/[lang]/sign-up` son la misma ventana: el link «Crear cuenta» solo cambia el título, la descripción y el propio link.
- La pantalla del código es igual para todos y no dice si el correo ya tenía cuenta. El código se puede pegar, se envía solo al sexto dígito y se puede pedir otro a los 30 segundos.
- **Con Clerk configurado,** el código lo envía y lo verifica Clerk. **Sin Clerk y en desarrollo,** la misma ventana pide un nombre, acepta cualquier código y abre el workspace `dev:<nombre>`. **En preview o producción sin Clerk,** la página avisa que todavía no se puede entrar ([ADR-0050](./adr/0050-login-clerk-y-modo-desarrollo.md)).
- Entrar a `/[lang]/dashboard…` sin sesión lleva a iniciar sesión y, al terminar, de vuelta a la página pedida. Con sesión abierta, la ventana de acceso manda directo a esa página o al dashboard.
- «Obtén tu API key» abre la ventana en modo crear cuenta y, al terminar, lleva a las API keys.
- La cabecera muestra **Iniciar sesión** o el menú de cuenta (Dashboard, API keys, Ajustes y Cerrar sesión). Se resuelve en el navegador para que las páginas públicas sigan estáticas.
- Cerrar sesión lleva a la landing. Las keys siguen funcionando.

## Dashboard

Una sidebar con la composición del catálogo ([ADR-0038](./adr/0038-sidebar-izquierda-con-iconos.md)) lleva a Inicio, Plan y límites, Créditos, API keys, Uso y Ajustes, más Modelos y Docs. Todavía no hay Playground ni Combos. Las pantallas usan los componentes de producto (`Card` con `Stat` y `Price`, `PriceComparison`, `ModelDetailPanel`, `QuickstartSnippet`, `UsageMeter`) y se ven en `/design-system`. Mientras el MoR no apruebe, comprar muestra un aviso de pagos no disponibles; en desarrollo los pagos se confirman al instante y no cobran ([08 · Créditos y pagos](./08-creditos-y-pagos.md#quién-cobra-un-merchant-of-record)).

### Inicio (`/[lang]/dashboard`)

- **Límites del plan:** la ventana de 5 horas y la semana con `UsageMeter` (porcentaje usado, cuándo se reinicia y valor usado), cuántas requests típicas quedan y qué pasa al llegar al límite, con un link a ajustarlo. Sin plan, una tarjeta lo explica y lleva a elegir uno.
- **Créditos** con botón **Recargar**, que lleva al depósito.
- **Checklist de 3 pasos** mientras no haya ningún request: elegir plan o recargar, crear una API key y copiar el snippet (Python, JS y curl, con la base URL ya puesta).
- **Últimos 7 días:** requests, valor de uso (y cuánto vino del plan), ahorro frente al precio oficial y tokens.
- **Qué gasta tu límite:** la parte del uso del plan por modelo.
- **Aviso de saldo bajo** cuando no hay plan y quedan menos de $2.

### Plan y límites (`/[lang]/dashboard/plan`)

- **Plan actual:** los dos medidores, hasta cuándo está activo, el rate limit y **Sumar 30 días**.
- **Al llegar al límite:** seguir con créditos o detenerse hasta el reinicio, el interruptor de créditos y el tope mensual de créditos con lo usado este mes.
- **Planes:** Plus, Pro y Max con precio por 30 días, límite cada 5 horas y cada semana, requests típicas que caben y rate limit. Subir cobra la diferencia prorrateada y aplica ya; un plan más barato se compra cuando termina el vigente.
- **Comprar un plan** abre un diálogo: precio, saldo y lo que queda después, y un botón para pagar con el saldo. Si el saldo no alcanza, muestra el depósito y completa la compra cuando llega ([ADR-0058](./adr/0058-deposito-por-cuenta-y-saldo.md)).
- **Consumo por modelo:** precio de entrada y salida, multiplicador frente a Claude Sonnet 5.5 y requests típicas por ventana y por semana.
- Las reglas están en [08 · Créditos y pagos](./08-creditos-y-pagos.md#planes) ([ADR-0049](./adr/0049-suscripcion-con-limites.md)).

### Créditos (`/[lang]/dashboard/credits`)

- Saldo actual: sirve para cualquier modelo.
- **Agregar créditos:** una pestaña por medio de pago.
  - **Solana y Base (USDC):** la dirección propia de la cuenta, con QR (la dirección o un link de wallet) y botón de copiar. Debajo, lo que pasa con el depósito: esperando, en camino o acreditado, con link a la transacción. Un desplegable explica cómo enviar desde un exchange ([ADR-0058](./adr/0058-deposito-por-cuenta-y-saldo.md)).
  - **Bitcoin:** se elige un monto y se cotiza. La cotización muestra el QR con el monto, el monto exacto en BTC, la dirección y cuánto le queda al precio fijo; después, lo que pasa con el pago: esperando, visto en la red o acreditado ([ADR-0065](./adr/0065-pagos-en-bitcoin.md)).
- **Orden de cobro:** plan y créditos, explicado en una tarjeta.
- **Historial de pagos** (depósitos y planes): fecha, concepto, monto, estado y link a la transacción.
- Los paquetes por modelo ya no se venden. Si a una cuenta le queda alguno, lo ve aquí y en Inicio.
- Detalle en [08 · Créditos y pagos](./08-creditos-y-pagos.md).

### API keys (`/[lang]/dashboard/keys`)

- **Lista** con nombre, hint (`wtf_Ab3x…9kQz`), de dónde cobra, modelos permitidos, gastado frente al límite, fecha de creación, último uso y las acciones **Rotar** y **Revocar** (las dos con confirmación).
- **Crear key:** nombre (obligatorio), límite de gasto en USD (opcional), de dónde cobra (plan y créditos, solo plan o solo créditos) y modelos permitidos (todos o una lista). Un diálogo muestra la key **una sola vez**, con botón de copiar y el aviso "No la volverás a ver".
- **Rotar** crea una key con los mismos ajustes y deja la anterior funcionando 24 horas.
- Detalle técnico en [05 · API keys](./05-api-keys.md).

### Uso (`/[lang]/dashboard/usage`)

- **Filtros:** rango (hoy, 24 h, 7 días, 30 días), key, modelo y fuente de cobro (plan, paquete, créditos o errores y rechazos).
- **Por fuente de cobro:** cuánto del valor de uso salió del plan, de paquetes y de créditos, y cuánto pagamos nosotros.
- **Tabla paginada de requests:** fecha, modelo, key, tokens de entrada y salida, valor, fuente, ahorro, latencia y estado.
- No hay contenido de prompts, porque no lo guardamos ([ADR-0014](./adr/0014-no-guardar-contenido.md)).

### Ajustes (`/[lang]/dashboard/settings`)

- **Cuenta:** con Clerk, su perfil (correo, contraseña, verificación en dos pasos y sesiones). En desarrollo, un aviso de que es una sesión de prueba.
- **Cerrar sesión.**
- **Tus datos:** descargar un JSON con la cuenta, las keys (sin secretos), el resumen de uso y los pagos.

## Docs (`/[lang]/docs`)

Una sola página, en este orden: base URL, autenticación, ejemplo en curl, Python y JS/TS, streaming, cómo elegir modelo (link a `/models`), tabla de errores y herramientas compatibles. El contenido sale de [04 · API](./04-api.md).

## Estados vacíos y errores

| Situación | Qué ve el usuario |
|---|---|
| Sin keys | "No API keys yet." + botón "Create key" |
| Sin uso | "No requests yet." + el snippet |
| Saldo en cero | Banner: "Your balance is $0. Requests will fail with 402." + Recargar |
| Límite del plan alcanzado | El medidor dice "Límite alcanzado" y cuándo se reinicia. La API responde `429 usage_limit_reached` si el excedente no cubre |
| Pagos no disponibles | Aviso en Plan y Créditos cuando no hay ningún medio de pago configurado: los pagos todavía no están abiertos |
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
