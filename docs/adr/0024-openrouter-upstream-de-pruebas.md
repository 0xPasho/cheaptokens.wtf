# ADR-0024: OpenRouter es el upstream de la fase de pruebas

- **Estado:** Reemplazada por [ADR-0028](./0028-inferhub-upstream-de-pruebas.md) el 2026-11-10: el usuario decidió probar con InferHub. Reemplazaba a [ADR-0022](./0022-openrouter-no-es-upstream.md).
- **Fecha:** 2026-11-08
- **Origen:** Usuario

## Contexto

- Todavía no hay upstreams de producción elegidos, y para construir y validar el gateway hace falta uno real.
- OpenRouter tiene exactamente la forma técnica que espera el gateway: una URL compatible con OpenAI, IDs `autor/modelo` iguales a los nuestros, `usage` en cada respuesta y saldo prepagado.
- [ADR-0022](./0022-openrouter-no-es-upstream.md) lo descartaba por sus términos y su precio. **El usuario decidió usarlo para las pruebas y dejar los términos fuera del alcance por ahora.**

## Decisión

- **OpenRouter es el upstream real de la fase de pruebas** (desarrollo, previews y pruebas cerradas).
- **Configuración:** `id: "openrouter"`, base URL `https://openrouter.ai/api/v1`, key en `UPSTREAM_OPENROUTER_API_KEY`.
- **La key de pruebas lleva un límite de crédito configurado en OpenRouter**, para acotar el gasto.
- **Costo en el catálogo:** precio del modelo en OpenRouter × 1.055, para incluir la comisión al comprar créditos. El costo real de cada request se toma de `usage.cost` y se guarda en `requests.upstream_cost_micro_usd`.
- **El catálogo de pruebas conserva los descuentos reales**, para que la interfaz se vea como el producto final. Como el costo de OpenRouter es igual o mayor al precio oficial, **la validación de margen solo advierte fuera de producción.** En producción sigue fallando ([ADR-0010](./0010-precio-por-descuento.md)).
- **El upstream simulado se mantiene** para los tests automáticos (errores, fallback y cortes que no se pueden provocar a voluntad con OpenRouter) y como segundo upstream para probar el fallback.
- **Los upstreams de producción se eligen al cerrar la fase de pruebas.**

## Consecuencias

- El gateway se puede construir y probar de punta a punta hoy, con modelos reales.
- **Cada request de prueba con descuento pierde dinero:** el usuario de prueba paga el precio cheaptokens.wtf y OpenRouter nos cobra el oficial más la comisión. El límite de crédito de la key acota la pérdida.
- El gateway tiene que manejar tres particularidades de OpenRouter, revisadas en su documentación el 2026-11-08. Las tres reglas aplican a cualquier upstream:
  1. **Comentarios SSE `: OPENROUTER PROCESSING`** para mantener viva la conexión. Revelan el upstream, así que **todo comentario se reemplaza por `: keep-alive`**. Nunca se reenvía tal cual.
  2. **Errores a mitad del stream con HTTP 200:** llegan como un chunk con un campo `error` en la raíz y `finish_reason: "error"`. Se traducen a nuestro formato de error en stream ([04 · API › Streaming](../04-api.md#streaming)). Un stream que termina sin contenido ni `usage` se trata como falla.
  3. **`usage` viene siempre**, con `cost` y `cost_details`. Se usa para registrar nuestro costo y se elimina antes de responder. En OpenRouter, `stream_options.include_usage` está deprecado y no tiene efecto, pero mandarlo no estorba.
- **Cancelaciones:** con algunos proveedores (OpenAI, Azure, Anthropic), OpenRouter deja de procesar y de cobrar si se aborta el stream. Con otros (Bedrock, Groq, Google) y en requests sin streaming, cobra completo. En la fase de pruebas se mantiene el drenado de [ADR-0013](./0013-medicion-con-usage-upstream.md) porque da el costo exacto. Abortar y consultar el costo después es una optimización para más adelante.
- Si alguien intenta llevar a producción OpenRouter con los descuentos actuales, la validación de margen lo bloquea. Es una protección del dinero, no una regla sobre términos.

## Alternativas descartadas

- **Solo el upstream simulado** ([ADR-0022](./0022-openrouter-no-es-upstream.md)): no prueba modelos reales, latencias reales ni el formato real de un agregador.
- **Catálogo de pruebas con descuento de 0%:** el margen cuadraría, pero la interfaz no se vería como el producto real.
