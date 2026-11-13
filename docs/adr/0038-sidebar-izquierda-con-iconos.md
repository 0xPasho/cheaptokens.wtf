# ADR-0038 · Sidebar al extremo izquierdo con iconos

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Actualiza:** la composición lateral de ADR-0036.

## Contexto

El usuario proporcionó una captura con la navegación lateral junto al borde izquierdo y pidió añadir iconos. El margen de 80 px y los filtros tipográficos grandes de la versión anterior no coinciden con esta referencia.

## Decisión

En escritorio el catálogo y el detalle tienen 20 px de margen exterior, una sidebar de 240 px y una separación de 40 px hasta el contenido. La cabecera comparte la alineación izquierda. La sidebar conserva su posición sticky y su scroll independiente.

Cada opción tiene un icono de 18 px, una etiqueta de 14 px y una fila de al menos 36 px. Los filtros de capacidad reutilizan `MODEL_TAG_ICONS` de Kubai; las opciones generales usan Grid y Users, y los autores conservan sus logos reales. Las opciones activas usan el fondo `accent`, con radio de 10 px. Los conteos van al extremo derecho.

Se comparte el mismo componente entre catálogo y detalle. Se mantienen los filtros en la URL, la combinación de capacidades con Y y la adaptación móvil existente.

## Consecuencias

El contenido aprovecha más ancho y las opciones se reconocen por sus iconos. Los iconos son decorativos y no alteran el nombre accesible de las acciones. `/design-system` refleja la composición nueva y las pruebas de navegador verifican la posición y el ancho laterales.

## Alternativas descartadas

- Quitar solamente unos píxeles al margen anterior: no reproduciría la distribución proporcionada.
- Usar un diseño distinto en el detalle: perdería la continuidad del catálogo.
