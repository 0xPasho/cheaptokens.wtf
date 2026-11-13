# ADR-0037 · Kubai Icons para la interfaz

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Actualiza:** la iconografía de ADR-0036.

## Contexto

El usuario pidió usar Kubai Icons en cheaptokens.wtf.

## Decisión

Los iconos de interfaz proceden del paquete oficial `kubai-icons-react` (MIT). Se reemplazan los imports de Lucide en páginas, componentes de producto y átomos compartidos, y se elimina la dependencia directa de `lucide-react`.

Los iconos heredan `currentColor` y el tamaño del control. Los iconos decorativos permanecen ocultos para lectores de pantalla; los botones conservan sus nombres accesibles. El runtime oficial proporciona el comportamiento hover y respeta movimiento reducido. Las flechas de texto de navegación se sustituyen también por los iconos correspondientes.

La marca del sitio y los logos de proveedores se conservan como logos, separados de la iconografía funcional. `/design-system` incluye una muestra de Kubai en ambos temas.

## Consecuencias

Se conserva el layout y el material NibbleRouter. Cuando no existe un nombre idéntico al de Lucide, se usa el equivalente de Kubai: Grid para la cuadrícula, Gauge para rapidez, CircleCheck para confirmación y CirclePlus/CircleX para agregar y cerrar. No se dibujan iconos nuevos.

## Alternativas descartadas

- Mantener Lucide dentro de los controles: mezclaría dos estilos de iconos.
- Copiar SVG o crear aproximaciones: el paquete oficial ya ofrece componentes React con render de servidor y tipado.
