# ADR-0035 · Catálogo con la composición de NibbleRouter

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Reemplaza parcialmente:** ADR-0023 (ancho y composición), ADR-0025 (acabado de páginas públicas).

## Contexto

El usuario proporcionó el proyecto local NibbleRouter como diseño para cheaptokens.wtf. La referencia tiene fondo negro, paneles opacos con radio de 28 px, filtros laterales y catálogo de dos columnas.

## Decisión

La portada presenta el catálogo completo y conserva el inicio rápido debajo. `/models` comparte el catálogo. Los filtros por capacidad se combinan con Y; el autor, la búsqueda y la ordenación se aplican juntos. Se puede alternar entre tarjetas y la tabla existente. En móvil las capacidades se distribuyen en filas y las tarjetas pasan a una columna.

La navegación ocupa el ancho del contenido. El detalle coloca el ejemplo y las especificaciones a la izquierda y los precios y el costo del request a la derecha (2:1). Se conservan Geist, la marca textual cheaptokens.wtf, los datos del catálogo, los formatos monetarios, los descuentos semánticos, ambos idiomas y ambos temas. El tema inicial es oscuro; las preferencias guardadas y la opción Sistema siguen funcionando.

El acabado plano se limita a las páginas públicas mediante `router-site`. Los átomos compartidos conservan su material de vidrio, los menús y sus alternativas de accesibilidad. No se copian marcas, datos ni enlaces sin destino de NibbleRouter.

## Consecuencias

El contenedor general tiene un máximo de 1440 px y márgenes de hasta 80 px. Las páginas de lectura conservan su ancho `prose`. Las tarjetas comparan siempre el precio oficial con el descontado. Las pruebas visuales cubren tarjetas, tabla, filtros, ambos temas e idiomas y móvil.

## Alternativas descartadas

- Sustituir la aplicación por el HTML de referencia: perdería rutas, formatos e integración del catálogo.
- Conservar el hero como primera pantalla: no reproduce la composición solicitada.
- Copiar el logo de Nibble: la marca de este producto sigue siendo cheaptokens.wtf.
