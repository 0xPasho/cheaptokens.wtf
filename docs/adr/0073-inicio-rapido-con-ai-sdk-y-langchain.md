# ADR-0073 · Inicio rápido del modelo con AI SDK y LangChain

- **Estado:** Aceptada. Reemplaza la composición de código y respuesta en paralelo de [ADR-0036](./0036-estilo-nibblerouter-completo.md) para el inicio rápido del detalle de modelo. Conserva su material, tipografía y el resto del detalle.
- **Fecha:** 2026-11-22
- **Origen:** Usuario (ejemplos simples con AI SDK y LangChain, corregir scroll y presentación) + Default (guía lineal y seguridad de la key).

## Contexto

El panel estrecho obligaba a desplazar el código en dos ejes, mientras una respuesta estática ocupaba la otra mitad. El selector de mensaje de sistema añadía una decisión antes de entender cómo conectar el modelo.

## Decisión

- El inicio rápido del detalle, para todos los modelos y en ambos idiomas, es una guía en una columna: configurar la key en la terminal, instalar la librería y guardar/ejecutar el ejemplo.
- JavaScript abre por defecto y usa `generateText` de AI SDK con `@ai-sdk/openai-compatible`. Python usa `ChatOpenAI` de `langchain-openai`, con Chat Completions explícito (`use_responses_api=False`). Cada lenguaje también ofrece OpenAI SDK como alternativa mediante un selector de librería. Las cinco opciones apuntan a la URL de cheapllm.wtf y al ID del modelo consultado.
- Los ejemplos usan `CHEAPLLM_API_KEY` del entorno, nunca una key en código del navegador. Se indican los prerrequisitos de saldo o plan y el comando para ejecutar cada archivo.
- cURL conserva acceso directo a HTTP, sin un paso de instalación innecesario.
- Desaparecen el selector de mensaje de sistema y la respuesta simulada. El texto explica que la respuesta aparecerá en la terminal al ejecutar el ejemplo. Visitar la página no envía requests a la API.
- El código crece con su contenido y las líneas se adaptan al ancho; no tiene una altura fija ni scroll local. Los botones copian el texto original, con sus saltos y sangría.
- Se reutilizan ModelDetailPanel, CodeBlock y las pestañas de Base UI. `/design-system` muestra la guía. Los ejemplos de migración y streaming de `/docs` mantienen el SDK existente; esta decisión se refiere al inicio desde cero en el catálogo.

## Consecuencias

La persona ve qué instalar, dónde poner su key y cómo ejecutar el código. Las pestañas eligen el lenguaje y un selector nativo elige la librería en JavaScript y Python. Se mantiene la compatibilidad del gateway con Chat Completions; no se añade una dependencia de AI SDK o LangChain al servidor del producto, pues son dependencias de las apps que copian los ejemplos.
