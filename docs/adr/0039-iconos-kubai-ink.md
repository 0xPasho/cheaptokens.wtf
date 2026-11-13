# ADR-0039 · Iconos Kubai con acabado Ink

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Actualiza:** el color de iconos de ADR-0037 y ADR-0038.

## Contexto

El usuario prefiere los iconos oscuros de la galería Kubai de su captura, con sombreado y pequeños detalles blancos.

## Decisión

Usar el color Ink oficial de Kubai mediante el token semántico `--icon-body`. Las variables de relleno y borde de la biblioteca toman este token, conservando los gradientes y detalles blancos originales en ambos temas. El sidebar deja de usar la variante soft, que cambia los detalles blancos por oscuros.

## Consecuencias

Los iconos mantienen el mismo acabado al seleccionar una fila o cambiar de tema. El color del texto, los estados semánticos y los logos de proveedores conservan sus tokens. La muestra de `/design-system` y las capturas visuales reflejan el acabado Ink.
