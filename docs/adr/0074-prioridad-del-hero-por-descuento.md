# ADR-0074: Opus y GPT 6.2 tienen prioridad en el hero cuando su descuento llega al 80 %

- **Estado:** Aceptada. Reemplaza el orden fijo del selector de [ADR-0070](./0070-hero-mas-tokens-por-menos.md).
- **Fecha:** 2026-11-22
- **Origen:** Usuario (priorizar Opus y GPT 6.2 según su descuento y elegir DeepSeek si bajan del 80 %) + Default (umbral inclusivo, desempate y modelos ausentes)

## Contexto

El hero empezaba siempre con DeepSeek V4.1 Flash. El usuario quiere destacar Claude Opus 5.5 y GPT 6.2 Sol cuando su descuento sea suficientemente alto, aunque DeepSeek tenga un descuento mayor.

## Decisión

- Claude Opus 5.5 y GPT 6.2 Sol se ordenan entre sí por `discountBps`, de mayor a menor. En empate, Opus queda primero.
- Si el mayor descuento entre ellos es **al menos 80 %** (`8_000` puntos base), van primero los dos, después DeepSeek V4.1 Flash y al final Gemini 4 Neon.
- Si los dos están por debajo del 80 %, DeepSeek pasa al primer lugar; después van Opus y GPT en su orden por descuento, y Gemini al final.
- El primer modelo queda seleccionado al cargar. El usuario puede elegir cualquiera de los otros desde el selector.
- Se usan los descuentos del catálogo vigente, sin fijarlos en el componente ni ordenar el catálogo completo. Los modelos ausentes se omiten; si falta DeepSeek, se conserva el primer candidato disponible.
- `heroModels` en `src/lib/marketing.ts` calcula el orden en el servidor, antes de formatear los precios. Se usa la revalidación existente del catálogo; no se cambia automáticamente una elección manual mientras la persona mira la página.

## Consecuencias

- La marca del modelo y un descuento de al menos 80 % tienen prioridad sobre el porcentaje máximo global.
- El 80 % exacto cumple el umbral; el 79,99 % no. La comparación usa puntos base, no el porcentaje redondeado para mostrarlo.
- Las pruebas cubren ambos ganadores, empates, el límite del 80 %, la vuelta a DeepSeek y candidatos ausentes. Las capturas muestran el orden que corresponda a los precios del catálogo del repo.

## Alternativas descartadas

- **Elegir siempre el mayor descuento de los cuatro:** DeepSeek o Gemini desplazarían a los dos modelos principales.
- **Opus siempre primero:** GPT debe ganar cuando su descuento sea mayor y llegue al umbral.
- **Quitar modelos cuando bajen del 80 %:** el umbral determina el modelo inicial, no cuáles se pueden elegir manualmente.
