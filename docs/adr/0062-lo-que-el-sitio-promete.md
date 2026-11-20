# ADR-0062: El sitio público publica los límites de los planes y dice que el precio publicado es un máximo

- **Estado:** Aceptada.
- **Fecha:** 2026-11-17
- **Origen:** Usuario (aprobó el artefacto con estas frases y pidió implementarlo tal como está) + Default (los límites de lo que se dice)

## Contexto

- [ADR-0054](./0054-cobro-por-costo-real.md) cobra cada request a su costo real más el margen, con el precio del catálogo como tope. Dejó anotado que «el texto del sitio todavía no dice que los precios son un máximo».
- Los límites de los planes son «valores iniciales que hay que calibrar» ([ADR-0049 › Margen](./0049-suscripcion-con-limites.md#margen), [ADR-0052](./0052-precios-de-los-planes.md)). Hasta ahora solo se veían dentro del dashboard.
- El cliente nunca ve el upstream ([01 · Visión](../01-vision.md#principios), principio 5).

## Decisión

Las páginas públicas (landing, `/pricing` y `/faq`) dicen:

- **«El precio publicado es el máximo: si el costo baja, pagas menos.»** Es cierto por construcción: el gateway manda el precio del catálogo como tope y cobra el costo real con su margen ([ADR-0054](./0054-cobro-por-costo-real.md)).
- **Los límites de cada plan:** precio por 30 días, límite cada 5 horas, límite semanal, requests por minuto y requests típicas con el modelo que se elija.
- **El mayor descuento y el descuento mediano del catálogo,** calculados en cada render.

Y no dicen:

- **Quién es el proveedor ni cuál es el margen.** «La ruta más barata» y «compramos capacidad por adelantado a proveedores que venden por debajo del precio oficial» lo explican sin nombrarlos.
- **Qué plan conviene.** Ningún plan se marca como recomendado: no hay datos de uso para decirlo.
- **Nada que no exista:** ni tarjeta, ni Claude Code, ni créditos de prueba. Cuando algo todavía no está, se dice «todavía no».

## Consecuencias

- **Calibrar los límites de un plan pasa a ser un cambio visible.** Bajar un límite después de publicarlo se lee como un recorte: conviene calibrar ([12 · pregunta 10](../12-preguntas-abiertas.md#10-calibrar-los-límites-de-los-planes-y-el-margen)) antes de mandar tráfico a la landing.
- **Si ADR-0054 cambia** (por ejemplo, aceptar rutas de respaldo más caras que el precio publicado, como deja pendiente [ADR-0055](./0055-catalogo-en-vivo-con-varios-proveedores.md)), la frase del precio máximo deja de ser cierta y hay que quitarla de la landing, de `/pricing` y de `/faq` (`home.strip.footnote`, `home.how.gatewaySteps`, `faq.items.howCharged` y `faq.items.pricesChange`).
- **Las requests típicas son aproximadas:** salen del precio del catálogo y un request real cuesta lo que costó ([ADR-0054](./0054-cobro-por-costo-real.md)). Las páginas lo presentan con «≈».

## Alternativas descartadas

- **Mostrar los planes sin sus límites hasta calibrarlos:** un plan sin límites visibles parece ilimitado, y lo que se compra justamente es el límite.
- **Publicar el margen («costo + 30 %»):** invita a negociar contra el costo de un proveedor que el cliente no ve, y el margen ya cambió dos veces en una semana ([ADR-0053](./0053-margen-minimo-de-30.md)).
- **No decir que el precio es un máximo:** es el argumento que más tranquiliza frente a precios que cambian cada minuto, y es verdad.
