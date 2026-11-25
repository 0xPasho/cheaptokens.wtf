# ADR-0080: `plan-3` no incluye Claude Fable

- **Estado:** Aceptada. Reemplaza, solo para `plan-3`, la decisión D4 de [17 · Puerta de socios](../17-puerta-de-socios.md#decisiones) («los mismos modelos en los cuatro planes»).
- **Fecha:** 2026-11-24
- **Origen:** Usuario (quitar Fable de `plan-3`) + Default (por prefijo de id y desde el siguiente `PATCH`)

## Contexto

- `plan-3` ($3 al mes, $0.42 por ventana de 5 horas) es el plan personal de Deska Pro. El 24 de noviembre, dos de sus clientes corrieron Deska Harness con Claude Fable 5.1 y recibieron 84 `429` en una tarde ([ADR-0079](./0079-reserva-con-tope-por-request.md)).
- **Fable no cachea en InferHub.** Sus rutas (`cc/`) las sirven vendedores con cuentas de Claude Code. En pruebas del 24 de noviembre, dos vendedores devolvieron 0 tokens en caché con el mismo prompt repetido y con `cache_control` explícito. En producción, 9 de 10 vueltas salieron sin caché.
- Una vuelta de Pi manda unos 23 000 tokens. Con Fable cuesta unos $0.09, así que la ventana de `plan-3` alcanza para 3 o 4 vueltas. Con Sonnet 4.6, que sí cachea solo desde la segunda vuelta, cuesta menos de $0.005.
- Deska guarda la lista `models` que contesta la puerta de socios al abrir o cambiar un plan, y con ella arma los modelos que ofrece. Un modelo que la puerta no lista, Deska no lo ofrece.

## Decisión

- **`plan-3` excluye los modelos cuyo id empieza con `anthropic/claude-fable-`** (`EXCLUDED_MODEL_PREFIXES` en `src/lib/partner/tiers.ts`). El prefijo cubre a Fable 5.1, a Fable 5.2 y a los que vengan.
- **La lista del plan** (`models` en la respuesta de `POST /plans` y `PATCH /plans/{id}`) y **las keys** (`allowed_models` al emitirse y en cada `PATCH`) salen de la misma regla. Los demás planes no cambian.
- **Las keys vivas no se tocan al publicar.** Reciben la lista nueva en el siguiente `PATCH`, que es cuando Deska también refresca la suya. Así la key y lo que Deska ofrece nunca difieren.

## Consecuencias

- Un asiento de `plan-3` ya no puede elegir Fable. Un request a Fable con una key nueva de `plan-3` responde `403 model_not_allowed_for_key`.
- Los dos clientes de `plan-3` que hoy usan Fable lo siguen teniendo hasta que Deska renueve o cambie su plan, como mucho un periodo pagado.
- Subir a `plan-9` o más devuelve Fable en el mismo `PATCH`, a la lista y a las keys vivas.
- Si otro modelo resulta igual de caro sin caché, se agrega su prefijo a la lista y se escribe otro ADR.

## Alternativas descartadas

- **Quitar también Opus:** no se midió si sus rutas cachean. Con $1.30 de entrada por millón, una vuelta de Opus 5 sin caché cuesta unos $0.03: unas 14 por ventana.
- **Que Deska use Sonnet 4.6 por defecto en `plan-3`:** quien elija Fable seguiría quedándose sin plan en 3 o 4 vueltas.
- **Excluir por precio de entrada:** depende de vendedores cuyo precio cambia cada hora, y un modelo entraría y saldría del plan sin que nadie lo decida.
- **Actualizar ya las keys vivas de `plan-3`:** Deska seguiría ofreciendo Fable hasta su siguiente `PATCH`, y cada vuelta respondería `403`.
