# ADR-0054: Cada request se cobra a su costo real en el upstream más el margen

- **Estado:** Aceptada. Cambia cómo se calcula el cobro de [ADR-0010](./0010-precio-por-descuento.md) y de [ADR-0030](./0030-cobro-minimo-por-request.md); el precio derivado del descuento sigue existiendo como referencia.
- **Fecha:** 2026-11-17
- **Origen:** Usuario (cobrar lo que costó, los precios publicados son aproximados) + Default (redondeo, tope y respaldo)

## Contexto

- Los asks de InferHub se mueven en horas ([ADR-0053](./0053-margen-minimo-de-30.md)). El costo real de un request depende del vendedor que tenga capacidad en ese momento ([ADR-0028](./0028-inferhub-upstream-de-pruebas.md)).
- Hasta ahora el cliente pagaba `tokens × precio del catálogo`, fijo desde la última regeneración. Si el costo real era menor, nos quedábamos la diferencia; el precio publicado no seguía al costo.
- InferHub reporta `usage.cost` en cada respuesta, y el gateway ya lo guardaba en `requests.upstream_cost_micro_usd`.

## Decisión

- **Cobro = `ceil(costo real × (1 + MIN_MARGIN))`,** con el `usage.cost` que reporta el upstream y el mismo `MIN_MARGIN` del catálogo (30 %). Está en `chargeForUpstreamCost`, `src/lib/gateway/metering.ts`.
- **El precio del catálogo es una referencia aproximada.** Se sigue usando para mostrar precios, para estimar y como respaldo: si el upstream no reporta su costo, se cobra `tokens × precio del catálogo`, como antes.
- **El tope de precio no cambia:** el gateway sigue mandando el costo del mapeo como máximo. El costo real nunca pasa de ese tope, así que el cobro por token nunca pasa del precio publicado.
- **Mínimo:** con tokens de salida se cobra al menos 10 µUSD (ADR-0030). Como InferHub cobra al menos 10 µUSD, un request mínimo cuesta ahora 13 µUSD.
- Planes, paquetes y créditos gastan ese mismo monto: el reparto de [ADR-0049](./0049-suscripcion-con-limites.md) no cambia.

## Consecuencias

- **El margen por request es 30 % sobre el costo por construcción,** cuando el upstream reporta su costo.
- **Si el costo real baja, el cliente paga menos** que el precio publicado, sin esperar a que se regenere el catálogo.
- **Si el costo sube por encima del tope, el request sigue fallando** (`no_provider_under_bid`) hasta que se regenere el catálogo. La actualización automática de [ADR-0055](./0055-catalogo-en-vivo-con-varios-proveedores.md) lo acota a unos minutos.
- **Dependemos del `usage.cost` del upstream.** Un upstream que reporte de menos nos hace cobrar de menos. La conciliación contra el dashboard del upstream ([07](../07-upstreams.md)) pasa a ser también una verificación de ingresos.
- **El mismo request puede costar distinto cada vez.** La página de uso muestra lo cobrado por request; las estimaciones ("requests típicas") siguen saliendo del precio del catálogo y son aproximadas. El texto del sitio todavía no dice que los precios son un máximo.

## Alternativas descartadas

- **Seguir cobrando el precio del catálogo y solo regenerarlo más seguido:** el cobro nunca sigue al costo del momento, que es lo que se pidió.
- **Quitar el tope de precio:** un vendedor caro podría cobrarle al cliente muy por encima de lo publicado.
- **Limitar el cobro al precio publicado también en el mínimo:** en requests mínimos el margen sería cero.
