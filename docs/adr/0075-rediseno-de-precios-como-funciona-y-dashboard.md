# ADR-0075: Precios, Cómo funciona y el dashboard, con menos líneas, tarjetas de un solo nivel y dibujos en código

- **Estado:** Aceptada. Cambia la composición de /pricing ([ADR-0061](./0061-paginas-de-precios-y-preguntas.md)), la de /how-it-works ([ADR-0071](./0071-pagina-como-funciona.md)) y el marco de los diálogos. El estilo NibbleRouter de [ADR-0036](./0036-estilo-nibblerouter-completo.md) se mantiene.
- **Fecha:** 2026-11-23
- **Origen:** Usuario (quitar espacio de sobra y líneas, que se note hecho por un experto; tomar como referencia las tarjetas, el diálogo y el botón con degradado que mandó; menos diálogos en Cómo funciona y algo con scroll; ocultar los datos sensibles con un ojo) + Default (medidas, textos y qué pieza va en cada lugar)

## Contexto

- El usuario y el dueño veían varias pantallas como hechas por IA: tarjetas dentro de tarjetas, una línea por fila, espacio vacío a la derecha, antetítulos sobre cada sección y datos repetidos.
- Las medidas tenían medios píxeles: interlineados de 1,5 sobre 13 o 14 px, títulos con `clamp` y columnas en fracciones.
- El dueño mandó referencias: tarjetas con un dibujo arriba, un diálogo con la cabecera más clara y un botón con degradado y brillo en el borde superior.

## Decisión

- **Sin líneas para separar.** Las tablas dentro de una card no llevan líneas: las cabeceras van en gris y las filas se separan por su alto. El pie del sitio, los pasos y los recibos tampoco llevan líneas.
- **Un solo nivel de contenedor.** No hay card dentro de card. Las cards que van lado a lado miden lo mismo y sus botones quedan en la misma línea.
- **Botones de la referencia.** El principal y el secundario llevan un degradado vertical y un brillo de 1 px arriba. Los tokens son `--button-primary` y `--button-secondary`, en `globals.css`. Hay un tamaño `xl` (48 px) para las llamadas grandes.
- **Diálogos.** Son una sola superficie con un solo borde, sin el bisel de vidrio, y la X mide 36 px. `FeatureDialog` es el diálogo de la referencia: cabecera clara, filas con su casilla de icono y botón a todo el ancho.
- **/pricing.**
  - Los planes van como tarjetas (`PricingPlans`).
  - «Cómo se cobra» va en siete cuadros con dibujos animados en CSS (`PricingBento`).
  - Cómo pagar abre `FeatureDialog`.
  - Desaparecen las secciones «Con plan y créditos» y «Cómo pagas», que ahora viven en esos cuadros.
- **/how-it-works.** Los seis pasos van con scroll (`HowScroll`): la lista a la izquierda y una tarjeta fija con el dibujo del paso que cruza la mitad de la pantalla. En móvil, cada paso lleva su dibujo encima. No hay diálogos. `HowFlow` y `RequestLife` se quitan.
- **Dashboard.**
  - **Inicio:** saluda, muestra el plan y su vencimiento, la URL base para copiar y un botón para crear una key (`/dashboard/keys#crear`). No repite los enlaces del menú lateral.
  - **Plan y límites:** compara los planes en una tabla, con el plan actual resaltado por tono. «Al llegar al límite» es un selector de dos opciones. Consumo por modelo empieza con 10 filas.
  - **Créditos:** el historial de pagos es una lista con la marca de cada pago.
  - **Ajustes:** el correo y el ID de la cuenta van ocultos hasta tocar el ojo (`SensitiveValue`).
- **Medidas enteras.** Los interlineados van en píxeles enteros y los anchos fijos se usan donde una fracción dejaba el contenido a medio píxel.

## Consecuencias

- Las capturas de referencia de `pnpm test:e2e` se regeneraron.
- `NumberedSteps` quedó sin uso y se quita.
- La landing no cambia de estructura. Toma el botón nuevo porque comparte el átomo.
- Algunas reglas de `nibblerouter.css` de la página anterior de Cómo funciona (`.nr-hw-flow`, `.nr-hw-life`) quedan sin uso. Se pueden borrar en una limpieza aparte.
- El movimiento se apaga con «reducir movimiento». En ese caso los dibujos quedan en su estado final.
