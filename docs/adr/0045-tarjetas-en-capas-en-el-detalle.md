# ADR-0045 · Tarjetas en capas en el detalle de modelo

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Amplía:** composición del detalle de ADR-0036 y capas de ADR-0043.

## Decisión

Aplicar la misma base opaca de radio 28 px y tarjeta delantera más clara de radio 22 px al detalle: cabecera, inicio rápido, parámetros de API, precios, especificaciones, información, coste, recursos y modelos relacionados.

`ModelDetailPanel` compone el átomo Card de shadcn y comparte los tokens del catálogo. La cabecera pone el modelo, su logo, identificador y descripción en la superficie clara; autor con logo corporativo y tarea quedan sobre la base inferior. El código se muestra sobre la superficie delantera, con scroll local y sin añadir una tercera tarjeta ornamental.

## Consecuencias

La composición se comparte con las muestras de `/design-system`. Se conservan sidebar, filtros en URL, pestañas de código, portapapeles, precios, enlaces de recursos y comportamiento responsive. No se agregan sombras ni transparencias.
