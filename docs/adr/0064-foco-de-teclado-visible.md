# ADR-0064: El foco de teclado se ve en todo el sitio, con su propio token

- **Estado:** Aceptada. Precisa «Se conserva el foco de teclado» de [ADR-0036](./0036-estilo-nibblerouter-completo.md).
- **Fecha:** 2026-11-18
- **Origen:** Default (salió al revisar la landing y la ventana de acceso con las reglas de accesibilidad)

## Contexto

- El estilo trasladado de NibbleRouter quitaba el contorno de foco de todos los links, botones y campos de las páginas del sitio (`outline: none`).
- Los átomos de shadcn pintan su foco como un anillo con `box-shadow`, y el material plano ([ADR-0036](./0036-estilo-nibblerouter-completo.md)) pone `box-shadow: none` en casi todos los botones del sitio.
- El resultado, medido con el teclado: en la landing, 43 de 72 paradas de Tab no mostraban dónde estaba el foco; en el catálogo, 128 de 136. Los links de texto, las tarjetas y «Saltar al contenido» no mostraban nada.
- `--ring`, el color del anillo de los átomos, da 2,6:1 sobre blanco. No alcanza el 3:1 que pide un indicador de estado.

## Decisión

- **Un token propio, `--focus-ring`,** para el foco de teclado: `oklch(0.5 0 0)` en claro y `oklch(0.72 0 0)` en oscuro. Pasa 3:1 sobre el fondo, las tarjetas y los fondos sutiles en los dos temas, y una prueba lo comprueba.
- **En las páginas del sitio (`.nr-site`),** cada link, botón y elemento enfocable lleva con `:focus-visible` un contorno de 2 px separado 2 px del control. Es `outline`, no `box-shadow`: no depende de que el estilo plano respete la sombra. Solo aparece al navegar con teclado.
- Donde el contenedor recorta lo que sobresale (las pestañas del snippet, la sidebar), el contorno va por dentro.
- **Una tarjeta cuyo link la cubre entera** (catálogo, «Precio a la vista») lleva el contorno en la tarjeta, no en el nombre del modelo.
- **«Saltar al contenido»** aparece arriba a la izquierda al recibir el foco.
- **Los campos de texto siguen sin contorno al pulsarlos:** el caret y el estado abierto bastan. La búsqueda de la cabecera se ensancha al enfocarla. La excepción es la ventana de acceso ([ADR-0063](./0063-una-sola-ventana-de-acceso.md)), donde el campo y la casilla activa del código usan el mismo token como borde.
- Los menús y diálogos, que se pintan fuera de `.nr-site`, conservan el anillo de sus átomos.

## Consecuencias

- Se puede recorrer cualquier página del sitio con el teclado sabiendo siempre dónde se está.
- Un control nuevo dentro de `.nr-site` recibe el contorno sin hacer nada. Si vive dentro de un contenedor con `overflow: hidden` y queda pegado al borde, hay que pasarlo a contorno interior.
- El átomo `Accordion` creaba un `::after` solo al enfocar, que movía el icono 16 px. Se quitó esa clase.
- Queda pendiente decidir si `--ring` de los átomos sube de contraste en claro: afecta a formularios y diálogos del dashboard y no se tocó aquí.

## Alternativas descartadas

- **Devolverle el `box-shadow` a cada botón:** habría que deshacerlo regla por regla, y los links de texto seguirían sin indicador.
- **Usar `--ring` para el contorno:** en claro no llega a 3:1.
- **El anillo del navegador sin tocar:** es azul del sistema sobre una interfaz en grises y cambia de un navegador a otro.
- **Contorno también en los campos de texto al pulsarlos:** el sitio decidió que el caret basta. Se respeta fuera de la ventana de acceso.
