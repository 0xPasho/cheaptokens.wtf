# 13 · Sistema de diseño

El estilo de cheapllm.wtf es el de NibbleRouter, trasladado directamente de la referencia local proporcionada por el usuario. [ADR-0036](./adr/0036-estilo-nibblerouter-completo.md) reemplaza el material liquid glass y la adaptación anterior. La referencia ejecutable es `/design-system`.

## Fuentes de verdad

- `src/app/nibblerouter.css`: CSS de `NibbleRouter/styles.css` y `model.css`, con clases `nr-` para evitar colisiones.
- `src/app/globals.css`: tokens semánticos de ambos temas y adaptaciones a los componentes Base UI/shadcn.
- `src/app/[lang]/layout.tsx` y `src/app/fonts/`: Inter Variable local (100–900), JetBrains Mono local (400), servidas con `next/font/local`.
- `src/components/catalog/`: catálogo, sidebar compartida, logos, detalle, inicio rápido y parámetros.
- `src/components/site/`: cabecera fija y pie compacto.

## Identidad y color

Fondo negro, paneles `#171717`, texto principal `#f3f3f3`, texto auxiliar `#8d8d8d`. Los valores viven solo en tokens de `globals.css`; los componentes y el CSS de composición consumen variables. El claro usa superficies neutras claras equivalentes. El tema inicial es oscuro; se conserva la preferencia guardada y la opción Sistema.

El nombre es `cheapllm.wtf`. La marca gráfica y los logos se trasladan de la referencia proporcionada. No se inventan logos de proveedores con iniciales o emojis.

`success` significa dinero a favor del usuario; `warning`, atención sin error; `destructive`, error o acción irreversible. Los precios del producto son neutrales. Las tarjetas del catálogo usan etiquetas neutras, incluidos los descuentos. El detalle muestra el precio oficial y el precio descontado juntos.

## Composición exacta

| Elemento | Estilo |
|---|---|
| Cabecera | Fija; altura 72 px; márgenes 20/24 px; nombre cheapllm.wtf de 16 px; navegación de 14 px; sin logo ni favicon de NibbleRouter |
| Búsqueda | En la cabecera; ancho 168 px, alto 40 px; pill; expande a 330 px al enfocar |
| Catálogo | Empieza a 112 px; márgenes 20 px; sidebar de 240 px, gap 40 px |
| Sidebar | Sticky a 96 px; iconos Kubai de 24 px; logos de autores de 18 px; etiquetas de 14 px; filas de al menos 36 px; selección con fondo accent y radio de 10 px |
| Tarjetas | Dos columnas, gap 14 px; base con radio 28 px y margen interior 8 px; arriba, tarjeta más clara con logo, nombre, descripción y etiquetas, radio 22 px y padding 16 px; debajo, autor y tipo de tarea en la base; sin sombras ornamentales |
| Nombre del modelo | 17 px, peso 500, tracking −0,2 px, logo 18 px |
| Metadatos | Logo corporativo del autor de 18 px junto al nombre de 13,5 px y peso 550; etiquetas pill. Google usa su G y Anthropic su símbolo corporativo; las tarjetas superiores conservan los símbolos de Gemini y Claude |
| Descripción de tarjeta | 13,5 px / 1,55; máximo dos líneas |
| Pills | 12 px; padding 5/12 px; fondo neutral |
| Detalle | Conserva sidebar; título de 36–52 px, peso 550 y tracking −0,045 em |
| Paneles de detalle | Principal y lateral 2:1, gap 28 px; base de radio 28 px con margen interior de 8 px; tarjeta clara de radio 22 px delante; títulos de 17 px y peso 500. La cabecera muestra autor y tarea en la base inferior |
| Código y respuesta | Dos columnas; código de 14 px / 22 px; sobre la superficie clara del panel; scroll local |
| Ventana de acceso | Una columna de 448 px que empieza a 144 px; título de 32–48 px, peso 550 y tracking −0,045 em; base de radio 28 px con margen interior de 8 px y frente de radio 20 px; campo y botón de 42 px; seis casillas de 48–56 px con radio 14 px, en dos grupos de tres; el foco siempre se ve ([ADR-0063](./adr/0063-una-sola-ventana-de-acceso.md)) |

[ADR-0038](./adr/0038-sidebar-izquierda-con-iconos.md) actualiza la composición lateral para seguir la captura proporcionada: margen izquierdo de 20 px y opciones con iconos. A 860 px el catálogo pasa a una columna y la navegación de escritorio se oculta; el detalle ofrece un botón para desplegar filtros. A 950 px la lateral del detalle pasa debajo. A 600 px código y respuesta se apilan. Las reglas de container query de la referencia adaptan el detalle al espacio que deja la sidebar.

No se agrega un hero, título grande sobre el catálogo, buscador debajo del título, tabla con otro estilo ni fila de precios dentro de las tarjetas.

## Material

Contenido y controles son opacos y planos. No hay halos, degradados de botones, bordes luminosos ni vidrio anidado. La cabecera conserva el fondo translúcido y blur de 20 px de la referencia.

Las utilidades `glass-*` se mantienen únicamente como aliases para compatibilidad con los átomos instalados; ahora producen el material plano. Los menús y diálogos tienen superficies opacas. Se conserva el soporte de movimiento reducido y el contraste de los controles.

**Bandas de la landing.** Para que las secciones se lean como bloques, una sí y otra no (por qué cuesta menos, precios, preguntas) lleva `.nr-mk-band`: un fondo `--surface-band` de borde a borde de la ventana, hecho con `border-image` y no con sombra. Dentro de la banda, las tarjetas usan `--surface-band-card` (blanco en claro, la tarjeta de siempre en oscuro). El título enorme queda para el hero, «¿Cómo puede costar tan poco?» y el cierre; el resto de las secciones de la landing va un paso más chico.

**Foco de teclado.** En las páginas del sitio, cada link y cada botón enfocado con el teclado lleva un contorno de 2 px por fuera, con el token `--focus-ring`, que pasa 3:1 sobre cada superficie en los dos temas. El anillo translúcido de los átomos (`--ring`) no sirve aquí: el estilo plano le quita el `box-shadow` y en claro no llega a 3:1. Una tarjeta cuyo link la cubre entera lleva el contorno en la tarjeta. «Saltar al contenido» aparece al recibir el foco. Los campos de texto no llevan contorno al pulsarlos, salvo los de la ventana de acceso. Ver [ADR-0064](./adr/0064-foco-de-teclado-visible.md).

## Datos, texto y funciones

Se usa el catálogo del repositorio, no la instantánea de datos de NibbleRouter. El aviso de catálogo de ejemplo aparece junto al conteo. No se inventan disponibilidad, actividad, máximo de salida ni APIs no implementadas.

Los textos públicos vienen de los diccionarios `en` y `es`. Dinero, porcentajes, fechas, tokens y conteos usan `@/lib/format`. El dinero viaja en µUSD. Nunca se usa `toFixed()` ni se concatenan signos monetarios.

Los filtros por capacidad se combinan con Y. Autor, búsqueda, orden y vista viven en la URL. Entrar a un modelo y volver conserva la selección. El catálogo tiene su propio campo de búsqueda. Ctrl/Cmd+K y `/` abren la paleta de la cabecera desde cualquier página: lleva a un modelo o a una página, o al catálogo filtrado (ADR-0069). Los ejemplos de respuesta están identificados y no disparan solicitudes.

## Iconos

Los iconos funcionales usan `kubai-icons-react`, con el acabado Ink mediante el token `--icon-body` en ambos temas y los tamaños de cada control. Se conservan el sombreado original, los detalles blancos, las etiquetas accesibles y los iconos decorativos ocultos. Los logos de marca y proveedores no se sustituyen. En la landing, los motivos, los pasos y los usos de key llevan su icono Ink a 26–28 px sin cuadro detrás; los chips de «Funciona con» y de pago llevan el logo de la marca (OpenAI, LangChain, Vercel, USDC, Bitcoin), decorativo porque el nombre va escrito al lado. Ver [ADR-0037](./adr/0037-iconos-kubai.md) y [ADR-0039](./adr/0039-iconos-kubai-ink.md). La muestra está en `/design-system`.

## Componentes

`ModelLogo` muestra el símbolo de cada familia en tarjetas y detalle: Claude en terracota, Gemini multicolor, DeepSeek azul, Qwen en su azul de marca y Meta con su gradiente para Llama. GPT usa el símbolo monocromo de OpenAI, negro en claro y blanco en oscuro. Los SVG locales conservan los colores de marca y no toman el acabado Ink de Kubai. Procedencia en `public/brand/logos/README.md`; decisión en [ADR-0040](./adr/0040-logos-de-modelos-a-color.md).

Se conservan Base UI y shadcn. Para links con apariencia de botón se usa `buttonVariants` sobre `Link`; para composición Base UI se usa `render`. `ModelCatalog`, `CatalogSidebar`, `ModelDetail`, `ModelDetailPanel`, `ModelQuickstart`, `ModelApiDetails`, `ProviderLogo`, `CodeBlock`, `Price` y `PriceComparison` son los patrones reutilizables. `ModelDetailPanel` compone Card de shadcn para compartir las dos capas en toda la página de modelo. `AuthWindow` es la única ventana para entrar o crear cuenta, y su código de verificación usa el átomo `InputOTP`: no se arma otro formulario de acceso. Los átomos y los patrones nuevos se muestran en `/design-system`.

## Verificación

Antes de terminar se corre `pnpm check`. Los cambios visuales requieren `pnpm test:e2e`, y las capturas intencionales se regeneran con `pnpm test:e2e:update` y se inspeccionan. Las pruebas de navegador incluyen ambos temas e idiomas, accesibilidad axe, geometría del catálogo, navegación con filtros, pestañas de ejemplos y móvil. El contraste de tokens se recalcula en las pruebas unitarias.
