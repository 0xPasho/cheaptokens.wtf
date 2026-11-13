# ADR-0042 · Tarjetas de modelos en dos capas

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Actualiza:** tarjetas del catálogo en ADR-0036.

## Contexto

El usuario pide una tarjeta base y una segunda tarjeta más clara delante para los modelos del catálogo.

## Decisión

Conservar el nombre, el logo y el autor en la base de radio 28 px. Colocar descripción y etiquetas en un panel delantero opaco de radio 22 px, separado del borde exterior por 8 px. Los tokens `--surface-model-front` y `--surface-model-pill` mantienen la separación entre capas en ambos temas, sin sombras ni blur. El tamaño de los logos no cambia.

## Consecuencias

Las tarjetas tienen dos superficies visibles y mantienen un único enlace accesible. El catálogo de `/design-system` reutiliza esta composición. Se mantienen los filtros, la vista de lista y la adaptación móvil.
