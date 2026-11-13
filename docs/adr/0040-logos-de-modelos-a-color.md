# ADR-0040 · Logos de modelos con sus colores de marca

- **Estado:** Aceptada
- **Origen:** Usuario
- **Fecha:** 2026-11-12
- **Actualiza:** los logos de modelos de ADR-0036.

## Contexto

El usuario solicita el logo oficial a color de cada modelo. Las tarjetas usaban el logo corporativo de Anthropic para Claude, un símbolo plano para Gemini y un símbolo blanco de OpenAI que se perdía en el tema claro.

## Decisión

Compartir `ModelLogo` en tarjetas y detalle. Claude utiliza su símbolo terracota; Gemini, DeepSeek, Qwen y Meta/Llama conservan los colores y gradientes de sus marcas. Para GPT se usa el símbolo monocromo de OpenAI, adaptado al fondo claro u oscuro. La sidebar conserva la distinción entre autor y familia de modelos.

Los SVG se sirven localmente y su procedencia y licencia quedan junto a los archivos. No se recolorean con los tokens de iconos funcionales Kubai.

## Consecuencias

Los modelos se reconocen por su familia visual y los logos mantienen contraste en ambos temas. `/design-system` muestra las seis familias. Nuevas familias que tengan una marca distinta de su autor deben añadir su correspondencia en `ModelLogo`.
