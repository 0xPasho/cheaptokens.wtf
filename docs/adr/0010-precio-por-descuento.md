# ADR-0010: Precio cheaptokens.wtf = oficial × (1 − descuento por modelo), con margen mínimo

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Usuario (mostrar el precio real y el descuento por modelo) + Default (fórmula y validación)

## Contexto

El catálogo debe mostrar, para cada modelo, el precio real (oficial), el precio cheaptokens.wtf y el descuento. Cada upstream nos cobra un costo distinto. Hay que garantizar que ningún precio publicado pierda dinero, y que los tres números (oficial, cheaptokens.wtf y descuento) nunca se contradigan.

## Decisión

- Cada modelo guarda el **precio oficial** de input y de output por 1M de tokens, con la URL de origen y la fecha de verificación.
- Cada modelo guarda **un solo descuento** en puntos base (`discount_bps`, 9000 = 90%).
- **El precio cheaptokens.wtf se deriva:** `oficial × (10000 − discount_bps) / 10000`, para input y para output. Se guarda calculado al sincronizar.
- **Validación de margen al sincronizar:** para todo upstream habilitado, `precio_cheaptokens ≥ costo_upstream × (1 + MIN_MARGIN)`, en input y en output. Si no se cumple, la sincronización falla.
- Por request se guardan tres costos: cobrado, upstream y oficial.

## Consecuencias

- El badge de descuento, el precio tachado y el precio cheaptokens.wtf siempre son coherentes entre sí.
- Si el autor cambia su precio oficial, basta con actualizar ese número.
- Nunca se publica un precio por debajo del costo más el margen mínimo.
- Si un upstream sube su precio, se baja el descuento de ese modelo o se apaga ese upstream: la sincronización obliga a decidir.
- El "ahorro" del dashboard es exacto e histórico, porque no se recalcula con precios nuevos.
- No se pueden dar descuentos distintos para input y output en el mismo modelo. Si hiciera falta, se agrega un segundo campo.

## Alternativas descartadas

- **Escribir el precio cheaptokens.wtf a mano y calcular el descuento:** dos números independientes que se desincronizan, y porcentajes feos (−87.3%).
- **Precio = costo upstream + margen:** el descuento mostrado cambiaría cada vez que cambia el upstream, y expondría nuestra estructura de costos.
- **Un descuento global para todo el catálogo:** cada modelo tiene costos upstream distintos. Un descuento único deja margen negativo en unos y margen de sobra en otros.
- **Precios por token en la interfaz:** $0.0000003 es ilegible. Se muestra por 1M, como hace toda la industria.
