# ADR-0072: El sitio explica una URL para todos los modelos; el SDK de OpenAI se explica en los docs

- **Estado:** Aceptada. Reemplaza el subtítulo del hero de [ADR-0070](./0070-hero-mas-tokens-por-menos.md) y las explicaciones de conexión de [ADR-0071](./0071-pagina-como-funciona.md). Conserva las decisiones de API y compatibilidad.
- **Fecha:** 2026-11-22
- **Origen:** Usuario (explicar el acceso a todos los modelos desde una URL sin presuponer conocimiento del SDK de OpenAI) + Default (redacción y alcance en ambos idiomas)

## Contexto

«El SDK de OpenAI que ya usas» presupone que quien llega conoce una librería y su papel como cliente de una API compatible. Ese detalle distrae de la idea del producto: una sola conexión para usar distintos modelos.

## Decisión

- La landing, «Cómo funciona», las preguntas frecuentes, los metadatos y el footer explican **una URL y una API key para todos los modelos**. El modelo se elige en cada request.
- El subtítulo del hero pasa a «Todos tus modelos de IA desde una sola URL.» / «All your AI models through one URL.».
- La primera tarjeta del diagrama dice «Una URL para todos tus modelos» / «One URL for all your models», dirigida a quien conecta una app, un editor o un agente.
- La sección de conexión y sus pasos explican la URL y la API key. El diff se identifica como un ejemplo en Python, sin presentarlo como la herramienta que todo el mundo ya usa.
- Las etiquetas de integración dicen «Python y JavaScript», «LangChain», «Vercel AI» y «Editores de código compatibles». No se usa el logo de OpenAI para representar Python y JavaScript.
- Los detalles del SDK oficial, Chat Completions, los formatos de error y los reintentos quedan en `/docs`. La FAQ remite allí para los ejemplos y la lista de compatibilidad, y conserva que Claude Code todavía no es compatible.
- La misma explicación se aplica a español, inglés y al artefacto existente de «Cómo funciona».

## Consecuencias

- La persona puede entender qué obtiene sin conocer el estándar de compatibilidad ni una librería concreta.
- Una URL no significa compatibilidad universal: siguen vigentes los formatos soportados y las restricciones de [04 · API](../04-api.md). La página de documentación detalla qué herramientas funcionan.
- Cambian las capturas de las páginas públicas que comparten estos textos, en ambos idiomas y temas.

## Alternativas descartadas

- **Explicar el SDK antes de explicar el producto:** obliga a aprender una abstracción que no hace falta para entender qué se compra.
- **Quitar el SDK de la documentación técnica:** allí sí es útil para instalar las dependencias, copiar ejemplos y entender los errores.
- **Prometer que funciona con cualquier app o editor:** la compatibilidad depende del formato que utilice cada herramienta.
