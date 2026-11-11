# Documentación de cheaptokens.wtf

cheaptokens.wtf es **un solo endpoint, compatible con la API de OpenAI, para usar los principales LLMs pagando bastante menos que el precio oficial**. El usuario cambia `base_url`, pone su API key de cheaptokens.wtf y elige el modelo con un ID como `anthropic/claude-haiku-4.5`. Un modelo que oficialmente cuesta $3.00 por millón de tokens aquí puede costar $0.30.

Web: `cheaptokens.wtf` · API: `https://api.cheaptokens.wtf/v1`. Fecha de esta versión: 2026-11-10.

## Índice

| # | Documento | De qué trata |
|---|---|---|
| 01 | [Visión](./01-vision.md) | Qué es, para quién, principios, qué no es, modelo de negocio |
| 02 | [Producto y UX](./02-producto-y-ux.md) | Páginas, flujos y contenido de cada pantalla |
| 03 | [Arquitectura](./03-arquitectura.md) | Componentes, flujo de un request, streaming, seguridad, límites |
| 04 | [API pública](./04-api.md) | Contrato de `/v1/*`: endpoints, errores, ejemplos |
| 05 | [API keys](./05-api-keys.md) | Formato, almacenamiento, ciclo de vida y validación |
| 06 | [Catálogo y precios](./06-catalogo-y-precios.md) | IDs, precios, descuentos, margen, tags |
| 07 | [Upstreams](./07-upstreams.md) | Proveedores a los que compramos tokens, routing, fallback, riesgos |
| 08 | [Créditos y pagos](./08-creditos-y-pagos.md) | Prepago, Merchant of Record, cobro por request, saldo, fraude |
| 09 | [Modelo de datos](./09-modelo-de-datos.md) | Tablas, índices e invariantes |
| 10 | [Internacionalización](./10-i18n.md) | Idiomas, rutas, diccionarios, formato |
| 11 | [Roadmap](./11-roadmap.md) | Fases, alcance del MVP, criterios de lanzamiento |
| 12 | [Preguntas abiertas](./12-preguntas-abiertas.md) | Lo que falta decidir |
| 13 | [Sistema de diseño](./13-sistema-de-diseno.md) | Color, tema, tipografía, formatos y componentes de la interfaz |
| 14 | [Plan: landing, catálogo y detalle](./14-plan-landing-y-catalogo.md) | Cómo se construyeron las páginas públicas y qué salió al hacerlo |
| 15 | [Plan: gateway con InferHub](./15-plan-gateway.md) | Prerrequisitos, decisiones y paquetes de trabajo para construir el gateway con orquestación |
| — | [ADRs](./adr/README.md) | Registro de decisiones, con alternativas descartadas |

## Decisiones clave en una línea

- **El descuento sale de comprar tokens a plataformas agregadoras** (upstreams) con una URL única. Nosotros las ponemos detrás de nuestro endpoint. → [ADR-0001](./adr/0001-upstreams-agregadores.md)
- **La API es compatible con OpenAI Chat Completions.** Solo hay que cambiar `base_url`. → [ADR-0002](./adr/0002-api-compatible-openai.md)
- **Clerk solo protege el dashboard; las API keys son nuestras.** El endpoint `/v1/*` nunca llama a Clerk. → [ADR-0003](./adr/0003-clerk-solo-dashboard.md), [ADR-0027](./adr/0027-formato-api-keys-wtf.md)
- **La marca es `cheaptokens.wtf`**, escrita completa y en minúsculas: es el nombre, el wordmark y el dominio. La API vive en `api.cheaptokens.wtf` y las keys empiezan con `wtf_`. → [ADR-0026](./adr/0026-marca-cheaptokens-wtf.md), [ADR-0027](./adr/0027-formato-api-keys-wtf.md)
- **Todo vive en una app de Next.js en Vercel**, con el gateway aislado para poder sacarlo después y la API en su propio host. El gateway es una función con sus dependencias inyectadas. → [ADR-0005](./adr/0005-gateway-en-nextjs-vercel.md), [ADR-0026](./adr/0026-marca-cheaptokens-wtf.md), [ADR-0033](./adr/0033-gateway-con-dependencias-inyectadas.md)
- **El cobro es prepago, en USD, y el dinero se guarda como micro-dólares enteros.** → [ADR-0007](./adr/0007-dinero-en-micro-dolares.md), [ADR-0008](./adr/0008-creditos-prepagados.md)
- **Las recargas se cobran con un Merchant of Record** (Polar, luego Paddle), con aprobación por escrito antes de integrar. → [ADR-0019](./adr/0019-merchant-of-record.md)
- **Somos intermediarios, con entidad legal en México.** → [ADR-0020](./adr/0020-intermediario-entidad-mexico.md)
- **En la fase de pruebas el upstream es InferHub**, con una key propia, tope de precio por request y un upstream simulado para los tests automáticos. → [ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)
- **El precio cheaptokens.wtf es el precio oficial menos un descuento por modelo**, con un margen mínimo validado sobre el costo upstream y un cobro mínimo de $0.00001 por request con salida. → [ADR-0010](./adr/0010-precio-por-descuento.md), [ADR-0030](./adr/0030-cobro-minimo-por-request.md)
- **Nunca guardamos prompts ni respuestas.** → [ADR-0014](./adr/0014-no-guardar-contenido.md)
- **El gateway se construye por olas,** con planificador, ejecutores en paralelo y revisores que solo ven el diff. → [ADR-0034](./adr/0034-construccion-por-olas.md)
- **Producto global con i18n desde el día uno** (en, es). → [ADR-0015](./adr/0015-i18n-nativo.md)
- **Interfaz neutra: el color solo comunica dinero a favor, atención o error.** Hay modo oscuro desde el inicio. → [ADR-0023](./adr/0023-sistema-de-diseno-neutro.md)
- **Material liquid glass en controles y navegación**, con opacidad calculada para AA con el peor fondo detrás. El contenido va opaco. → [ADR-0025](./adr/0025-material-liquid-glass.md)

## Glosario

- **Upstream:** plataforma externa a la que le compramos tokens y a la que reenviamos los requests. El cliente nunca la ve.
- **Precio oficial:** lo que cobra el creador del modelo (Anthropic, OpenAI, Google…) por 1M de tokens. Es el "precio real" que mostramos tachado.
- **Precio cheaptokens.wtf:** lo que cobramos nosotros por 1M de tokens.
- **Costo upstream:** lo que nos cobra el upstream por 1M de tokens.
- **Margen:** precio cheaptokens.wtf − costo upstream.
- **Workspace:** dueño del saldo y de las API keys. En el MVP hay uno por usuario.
- **µUSD (micro-dólar):** 0.000001 USD. Es la unidad interna para todo el dinero.
- **Gateway:** la parte del sistema que atiende `/v1/*`.
- **Hot path:** lo que se ejecuta en cada request al gateway. Ahí cada milisegundo y cada dependencia cuentan.
