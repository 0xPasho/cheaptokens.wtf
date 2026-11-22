# ADRs · Registro de decisiones de arquitectura

Cada ADR registra **una** decisión: el contexto, qué se decidió, las consecuencias y **qué se descartó y por qué**. Las alternativas descartadas son lo que evita reabrir el mismo debate dos semanas después.

## Reglas

- Los ADRs no se editan para cambiar una decisión. Se escribe uno nuevo que **reemplaza** al anterior, y el anterior pasa a `Reemplazada por ADR-XXXX`.
- **Estados:** `Propuesta` (falta confirmar algo), `Aceptada`, `Reemplazada`, `Obsoleta`.
- **Origen:** "Usuario" cuando la decisión la tomó el dueño del producto. "Default" cuando se propuso (en el grilling del 2026-11-08 o en un plan) y no se objetó.

## Índice

| ADR | Decisión | Estado | Origen |
|---|---|---|---|
| [0001](./0001-upstreams-agregadores.md) | El descuento sale de comprar tokens a plataformas agregadoras (upstreams) | Aceptada | Usuario |
| [0002](./0002-api-compatible-openai.md) | API pública compatible con OpenAI Chat Completions | Aceptada (ampliada por 0031) | Default |
| [0003](./0003-clerk-solo-dashboard.md) | Clerk solo para el dashboard, API keys propias | Aceptada (ampliada por 0050) | Usuario |
| [0004](./0004-formato-api-keys.md) | Formato de API key con prefijo + checksum, guardadas como SHA-256 | Reemplazada por 0027 | Default |
| [0005](./0005-gateway-en-nextjs-vercel.md) | Gateway dentro de Next.js en Vercel, aislado para poder extraerlo | Aceptada (el hosting cambia por 0059) | Default |
| [0006](./0006-postgres-neon-drizzle.md) | Postgres en Neon con Drizzle | Reemplazada por 0032 | Default |
| [0007](./0007-dinero-en-micro-dolares.md) | Dinero como enteros en micro-dólares | Aceptada | Default |
| [0008](./0008-creditos-prepagados.md) | Créditos prepagados y cobro después del request | Reemplazada por 0049 | Default |
| [0009](./0009-stripe-checkout.md) | Stripe Checkout para recargas | Reemplazada por 0019 (plan B) | Default |
| [0010](./0010-precio-por-descuento.md) | Precio cheaptokens.wtf = oficial × (1 − descuento por modelo), con margen mínimo | Aceptada | Usuario + Default |
| [0011](./0011-tags-curados.md) | Lista fija de tags: curados y calculados | Aceptada | Usuario + Default |
| [0012](./0012-catalogo-en-repo.md) | Catálogo versionado en el repo y sincronizado a la BD | Aceptada | Default |
| [0013](./0013-medicion-con-usage-upstream.md) | Medir con el `usage` del upstream y drenar el stream al cancelar | Aceptada | Default |
| [0014](./0014-no-guardar-contenido.md) | No guardar prompts ni respuestas | Aceptada | Default |
| [0015](./0015-i18n-nativo.md) | i18n con el patrón nativo de Next 16 (`[lang]` + diccionarios) | Aceptada | Usuario + Default |
| [0016](./0016-workspace-dueno.md) | El workspace es dueño del saldo y las keys, con cuentas personales | Aceptada | Default |
| [0017](./0017-rate-limit-upstash.md) | Rate limit por workspace con Upstash Redis | Aceptada | Default |
| [0018](./0018-sin-creditos-gratis.md) | Sin créditos gratis al registrarse | Aceptada | Default |
| [0019](./0019-merchant-of-record.md) | Merchant of Record para las recargas (Polar, luego Paddle) | **Propuesta**, en pausa por 0058 | Usuario + Default |
| [0020](./0020-intermediario-entidad-mexico.md) | cheaptokens.wtf opera como intermediario, con entidad en México | Aceptada | Usuario |
| [0021](./0021-dominios.md) | Dominio temporal, con la web y la API en hosts separados | Reemplazada por 0026 | Usuario + Default |
| [0022](./0022-openrouter-no-es-upstream.md) | OpenRouter no es upstream; los términos del upstream deben permitir la reventa | Reemplazada por 0024 | Default |
| [0023](./0023-sistema-de-diseno-neutro.md) | Sistema de diseño neutro, con color solo para dinero, atención y error | Aceptada | Default |
| [0024](./0024-openrouter-upstream-de-pruebas.md) | OpenRouter es el upstream de la fase de pruebas | Reemplazada por 0028 | Usuario |
| [0025](./0025-material-liquid-glass.md) | Material liquid glass para la capa de controles y navegación | Aceptada | Usuario + Default |
| [0026](./0026-marca-cheaptokens-wtf.md) | La marca es `cheaptokens.wtf`, con la web en `cheaptokens.wtf` y la API en `api.cheaptokens.wtf` | Reemplazada por 0051 | Usuario + Default |
| [0027](./0027-formato-api-keys-wtf.md) | Formato `wtf_` + checksum, guardadas como SHA-256 | Aceptada | Usuario + Default |
| [0028](./0028-inferhub-upstream-de-pruebas.md) | InferHub es el upstream de la fase de pruebas, con tope de precio por request | Aceptada (la key pasa a una lista de cuentas por 0057) | Usuario + Default |
| [0029](./0029-catalogo-de-pruebas-inferhub.md) | El catálogo de pruebas usa cuatro modelos que InferHub sirve de verdad | Aceptada | Default |
| [0030](./0030-cobro-minimo-por-request.md) | Cobro mínimo de 10 µUSD por request que genera salida | Aceptada | Default |
| [0031](./0031-reasoning-content-pasa-al-cliente.md) | `reasoning_content` pasa al cliente | Aceptada | Default |
| [0032](./0032-postgres-node-postgres-y-pglite.md) | Postgres con Drizzle y node-postgres; PGlite en desarrollo y pruebas | Aceptada | Default |
| [0033](./0033-gateway-con-dependencias-inyectadas.md) | El gateway es una función con dependencias inyectadas | Aceptada | Default |
| [0034](./0034-construccion-por-olas.md) | El gateway se construye por olas, con planificador, ejecutores y revisores | Aceptada | Usuario + Default |
| [0035](./0035-catalogo-nibblerouter.md) | Catálogo público con la composición de NibbleRouter y tema inicial oscuro | Aceptada | Usuario |
| [0036](./0036-estilo-nibblerouter-completo.md) | Traslado completo del estilo de NibbleRouter, fuentes locales y material plano | Aceptada | Usuario |
| [0037](./0037-iconos-kubai.md) | Kubai Icons como iconografía de interfaz, reemplazando Lucide | Aceptada | Usuario |
| [0038](./0038-sidebar-izquierda-con-iconos.md) | Sidebar junto al borde izquierdo con filas compactas e iconos Kubai | Aceptada | Usuario |
| [0039](./0039-iconos-kubai-ink.md) | Iconos Kubai con acabado Ink en ambos temas | Aceptada | Usuario |
| [0040](./0040-logos-de-modelos-a-color.md) | Logos de familias de modelos con sus colores de marca | Aceptada | Usuario |
| [0041](./0041-iconos-sidebar-mas-grandes.md) | Iconos funcionales de sidebar de 24 px, sin aumentar logos de modelos | Aceptada | Usuario |
| [0042](./0042-tarjetas-de-modelos-en-dos-capas.md) | Tarjetas de modelos con base y panel delantero más claro | Aceptada | Usuario |
| [0043](./0043-tarjeta-clara-arriba-y-autor-abajo.md) | Tarjeta clara arriba con modelo y logo; autor y tarea abajo sobre la base | Aceptada | Usuario |
| [0044](./0044-logo-corporativo-junto-al-autor.md) | Logo corporativo junto al nombre del autor en la franja inferior | Aceptada | Usuario |
| [0045](./0045-tarjetas-en-capas-en-el-detalle.md) | Extender las tarjetas en dos capas a toda la página de modelo | Aceptada | Usuario |
| [0046](./0046-catalogo-desde-la-lista-oficial.md) | Importar modelos, precios y rutas desde la lista oficial de InferHub | Aceptada | Usuario |
| [0047](./0047-retirar-la-marca-nibblerouter.md) | Retirar el logo y favicon de NibbleRouter y mostrar cheaptokens.wtf | Aceptada | Usuario |
| [0048](./0048-modo-retro-konami.md) | El código Konami (↑↑↓↓←→←→BA Enter) activa el modo retro de toda la web | Aceptada | Usuario |
| [0049](./0049-suscripcion-con-limites.md) | Planes mensuales con límites cada 5 horas y cada semana, con paquetes por modelo y créditos de respaldo | Aceptada (precios y límites cambiados por 0052; renovación y paquetes cambiados por 0058; admisión con reserva por 0066) | Usuario |
| [0050](./0050-login-clerk-y-modo-desarrollo.md) | Login con Clerk cuando está configurado, y un modo de desarrollo solo en local | Aceptada (pantalla de acceso cambiada por 0063) | Usuario |
| [0051](./0051-marca-cheapllm-wtf.md) | La marca es `cheapllm.wtf`, con la web en `cheapllm.wtf` y la API en `api.cheapllm.wtf` | Aceptada | Usuario |
| [0052](./0052-precios-de-los-planes.md) | Plus, Pro y Max cuestan $9, $39 y $99 al mes, con la ventana al 14 % y la semana al 60 % del precio | Aceptada | Usuario + Default |
| [0053](./0053-margen-minimo-de-30.md) | El margen mínimo sobre el costo del upstream sube de 10 % a 30 % | Aceptada | Usuario |
| [0054](./0054-cobro-por-costo-real.md) | Cada request se cobra a su costo real en el upstream más el margen; el precio del catálogo queda como referencia y tope | Aceptada | Usuario + Default |
| [0055](./0055-catalogo-en-vivo-con-varios-proveedores.md) | El catálogo vigente vive en la base, se actualiza solo desde los proveedores y admite varios | Aceptada | Usuario + Default |
| [0056](./0056-pagos-en-usdc.md) | Se cobra en USDC sobre Solana y Base, directo a nuestras wallets, con un monto único por orden; los planes se pagan por 30 días | Reemplazada por 0058 | Usuario + Default |
| [0057](./0057-varias-cuentas-por-upstream.md) | Un upstream puede tener varias cuentas: el gateway rota entre ellas y, si una falla por su key, saldo o rate limit, prueba la siguiente | Aceptada | Usuario + Default |
| [0058](./0058-deposito-por-cuenta-y-saldo.md) | Cada cuenta deposita USDC en su propia dirección y el sistema lo barre a la wallet principal; el depósito es saldo para cualquier modelo, los planes se pagan con saldo y ya no se venden paquetes por modelo | Aceptada | Usuario + Default |
| [0059](./0059-servidor-propio-con-pm2-y-nginx.md) | La app corre en un servidor propio con pm2 y nginx, detrás de Cloudflare | Aceptada | Usuario |
| [0060](./0060-landing-explica-el-producto.md) | La landing explica el producto en ocho secciones; el catálogo se queda en `/models` | Aceptada | Usuario + Default |
| [0061](./0061-paginas-de-precios-y-preguntas.md) | Precios y preguntas frecuentes tienen página propia: `/pricing` y `/faq` | Aceptada | Usuario + Default |
| [0062](./0062-lo-que-el-sitio-promete.md) | El sitio publica los límites de los planes y dice que el precio publicado es un máximo | Aceptada | Usuario + Default |
| [0063](./0063-una-sola-ventana-de-acceso.md) | Una sola ventana para entrar o crear cuenta, con código por correo | Aceptada | Usuario + Default |
| [0064](./0064-foco-de-teclado-visible.md) | El foco de teclado se ve en todo el sitio, con su propio token `--focus-ring` | Aceptada | Default |
| [0065](./0065-pagos-en-bitcoin.md) | También se cobra en Bitcoin on-chain: el servidor solo tiene una xpub, cada compra se cotiza con el precio fijo 15 minutos y un plan se compra solo al confirmarse | Aceptada | Usuario + Default |
| [0066](./0066-reserva-por-request.md) | Cada request reserva su costo máximo antes de llamar al upstream; `max_tokens` se recorta a lo que alcanza | Aceptada (salida por defecto cambiada por 0067) | Usuario |
| [0067](./0067-salida-maxima-por-modelo.md) | Sin `max_tokens` del cliente, el tope es la salida máxima de cada modelo según el proveedor, no 32 768 para todos | Aceptada | Usuario |
| [0068](./0068-docs-un-solo-endpoint.md) | `/docs` gira alrededor de un solo endpoint con el formato de OpenAI y se ordena en empezar, usar y referencia; las cifras salen del código | Aceptada | Usuario + Default |

## Plantilla

```markdown
# ADR-XXXX: Título en forma de decisión

- **Estado:** Propuesta | Aceptada | Reemplazada por ADR-YYYY | Obsoleta
- **Fecha:** AAAA-MM-DD
- **Origen:** Usuario | Default

## Contexto
Qué problema o fuerza obliga a decidir.

## Decisión
Qué se decidió, en concreto.

## Consecuencias
Qué se vuelve más fácil, qué más difícil y qué hay que vigilar.

## Alternativas descartadas
- **Opción:** por qué no.
```
