# 01 · Visión

## Qué es

cheaptokens.wtf es un gateway de LLMs: **una URL, una API key y un saldo para usar modelos de muchos proveedores**, a un precio muy por debajo del oficial. Se parece a OpenRouter, con dos diferencias deliberadas:

1. **El precio.** Cada modelo muestra su precio oficial tachado, el precio cheaptokens.wtf y el porcentaje de descuento.
2. **La simplicidad.** Lo que no ayuda a hacer el primer request no aparece en la interfaz.

Legalmente, cheaptokens.wtf es un **intermediario** con entidad en México: da acceso, ruteo y cobro por uso hacia modelos de terceros, sin desarrollarlos ni hospedarlos ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)). Web en `cheaptokens.wtf` y API en `api.cheaptokens.wtf/v1` ([ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)).

## El problema

- Los precios oficiales de los modelos de punta son altos para devs independientes, startups y equipos chicos en cualquier país.
- Cada proveedor tiene su propia cuenta, su API key, su SDK, su facturación y sus límites. Probar tres modelos implica tres registros y tres tarjetas.
- Los agregadores que existen resuelven lo segundo, pero cobran el precio oficial o más.

## La propuesta

- **Una sola URL compatible con OpenAI.** Cualquier código que ya use el SDK de OpenAI funciona cambiando `base_url` y `api_key`.
- **Todos los modelos con un mismo saldo.** Recargas una vez y usas Claude, GPT, Gemini o modelos abiertos.
- **Descuento visible.** Precio oficial vs. precio cheaptokens.wtf, en cada fila del catálogo y en cada request del historial ("ahorraste $X este mes").
- **Clasificación útil.** Tags como `fast`, `reasoning`, `vision` o `coding` para encontrar el modelo adecuado sin leer benchmarks.

## Para quién

Desarrolladores de **cualquier país** que ya usan el SDK de OpenAI o herramientas compatibles (LangChain, Vercel AI SDK, scripts propios, editores que aceptan una base URL de OpenAI) y quieren pagar menos. La interfaz arranca en inglés y español ([ADR-0015](./adr/0015-i18n-nativo.md)).

Fuera del MVP: usuarios de Claude Code, que necesitan el formato `/v1/messages` de Anthropic (fase 2, ver [roadmap](./11-roadmap.md)).

## Principios

1. **Minimalismo.** Si una pantalla necesita explicación, sobra algo. El onboarding son tres pasos: recargar, crear key, copiar el snippet. **Meta: primer request exitoso en menos de 3 minutos desde el registro.**
2. **Transparencia de precio.** Siempre mostramos el precio oficial, el precio cheaptokens.wtf y el descuento. Nunca hay costos sorpresa.
3. **Compatibilidad antes que invención.** No inventamos un formato de API: usamos el de OpenAI, que el ecosistema ya entiende.
4. **No guardamos contenido.** Solo metadatos de uso ([ADR-0014](./adr/0014-no-guardar-contenido.md)).
5. **El cliente nunca ve el upstream.** Ni en headers, ni en IDs, ni en mensajes de error ([07 · Upstreams](./07-upstreams.md#ocultar-el-upstream)).
6. **El hot path no depende de terceros que no sean el upstream.** Ni Clerk ni el procesador de pagos se llaman durante un request a `/v1/*`.

## Qué NO es (no-objetivos del MVP)

- No hospedamos modelos ni tenemos GPUs.
- No hacemos routing "inteligente" que elija el modelo por el usuario. El usuario elige el modelo y nosotros elegimos el upstream.
- No hay plan gratis, créditos de regalo ni suscripción ([ADR-0018](./adr/0018-sin-creditos-gratis.md)).
- No hay equipos ni organizaciones ([ADR-0016](./adr/0016-workspace-dueno.md)).
- No hay playground ni chat en la web.
- No hay formato Anthropic, Responses API, embeddings, imágenes ni audio.

## Modelo de negocio

```
Costo upstream (C)  <  Precio cheaptokens.wtf (P)  <<  Precio oficial (O)
```

- Compramos tokens por adelantado a **upstreams**, plataformas agregadoras con una URL única que venden por debajo del precio oficial ([ADR-0001](./adr/0001-upstreams-agregadores.md)).
- Vendemos a `P = O × (1 − descuento)`, con un descuento por modelo ([ADR-0010](./adr/0010-precio-por-descuento.md)).
- **Fase de pruebas:** el upstream es InferHub ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)). Los upstreams de producción se eligen después, con la [lista de requisitos](./07-upstreams.md#requisitos-para-aceptar-un-upstream).
- Ganamos `P − C` por token. Un validador impide publicar un precio que no cubra el costo más un margen mínimo.
- El usuario paga por adelantado (prepago), así que no hay riesgo de crédito ([ADR-0008](./adr/0008-creditos-prepagados.md)). Cobra un Merchant of Record, que se encarga de los impuestos de cada país ([ADR-0019](./adr/0019-merchant-of-record.md)).

Riesgo principal del modelo: **dependemos de terceros cuyo precio y continuidad no controlamos.** Ver [07 · Upstreams › Riesgos](./07-upstreams.md#riesgos-y-mitigaciones).

## Métricas que importan

| Métrica | Meta inicial |
|---|---|
| Tiempo del registro al primer request exitoso | < 3 min (p50) |
| % de registrados que recargan | Medir desde el día uno |
| Margen bruto mensual (Σ P − Σ C) | Positivo desde el primer mes |
| Latencia que agrega el gateway antes del primer byte | p50 < 100 ms |
| Tasa de error atribuible a cheaptokens.wtf (5xx propios) | < 0.5% |
