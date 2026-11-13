# ADR-0036 · Traslado completo del estilo de NibbleRouter

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Reemplaza:** ADR-0035 y ADR-0025. Reemplaza las reglas de tipografía y composición de ADR-0023 que contradigan esta decisión.

## Contexto

El usuario rechazó la adaptación anterior y pidió expresamente el mismo estilo de NibbleRouter desde cero. Mantener Geist, los controles de vidrio, la tabla como vista de lista o la composición de la portada anterior no cumple esa instrucción.

## Decisión

Se traslada el CSS del proyecto local de referencia a `src/app/nibblerouter.css`, con clases prefijadas `nr-` para evitar colisiones con Tailwind. Las medidas, pesos, espaciados, radios, puntos de adaptación y composición vienen directamente de `styles.css` y `model.css`. Los valores de color viven en los tokens de `globals.css`.

Inter Variable y JetBrains Mono se sirven como archivos locales con `next/font/local`. Se usan el símbolo y los logos de proveedores incluidos en la referencia proporcionada por el usuario. El nombre del producto y los metadatos continúan siendo cheaptokens.wtf.

La cabecera es fija, con marca de 27 px, navegación de texto, buscador compacto y acciones pill. El catálogo comienza a 112 px, tiene márgenes de 80 px, sidebar de 250 px, separación de 56 px y tarjetas de 28 px en dos columnas. La lista sigue el formato compacto de tarjetas de la referencia. Los filtros son listas de texto, sin iconos ni controles de vidrio. Los precios comparados viven en el detalle.

El detalle conserva la misma sidebar, usa paneles opacos para inicio rápido, parámetros, precios y recursos, y presenta código y respuesta de ejemplo en paralelo. No se inventan actividad, límites ni compatibilidad con APIs que el gateway no tiene. Los ejemplos se identifican como tales y nunca ejecutan una solicitud desde el navegador.

Los filtros y la búsqueda se guardan en la URL y se conservan al visitar un modelo, volver o recargar. El buscador admite Ctrl/Cmd+K y `/`. Los componentes interactivos siguen usando los átomos existentes de Base UI/shadcn con el acabado nuevo.

## Consecuencias

Las utilidades históricas `glass-*` quedan como aliases de compatibilidad para superficies planas; dejan de producir vidrio, halos o sombras ornamentales. Solo la navegación fija conserva la transparencia y el blur de NibbleRouter. `/design-system` muestra el material nuevo y los componentes completos del catálogo y detalle. Las pruebas anteriores específicas del vidrio se sustituyen por comprobaciones del material opaco, accesibilidad, navegación y geometría de referencia.

Se conserva tema claro como contraparte neutral legible. El tema inicial es oscuro. Se conservan el catálogo real de este repositorio, sus avisos de datos de ejemplo, formatos monetarios e idiomas. Los enlaces apuntan únicamente a funciones que existen.

## Alternativas descartadas

- Aplicar más overrides a la adaptación anterior: conservaría su estructura y sus componentes visuales.
- Copiar datos y funciones ficticias de NibbleRouter: la solicitud es de estilo, y el producto debe seguir describiendo su API real.
