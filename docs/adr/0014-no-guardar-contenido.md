# ADR-0014: No guardar prompts ni respuestas

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

Los clientes van a mandar código, datos de sus usuarios y secretos de negocio. Sus prompts ya pasan por un tercero (el upstream, [ADR-0001](./0001-upstreams-agregadores.md)). Guardar el contenido nosotros sumaría otro lugar donde puede filtrarse, otra obligación legal y otra razón para no confiar en nosotros.

## Decisión

- **No se guarda ni se registra en logs el contenido** de requests ni de respuestas: ni `messages`, ni `tools`, ni texto generado, ni imágenes.
- **Solo se guardan metadatos:** workspace, key, modelo, upstream (interno), estado, tokens, costos y latencias ([09 · Modelo de datos](../09-modelo-de-datos.md#requests)).
- Los logs tampoco incluyen el header `Authorization`.
- La política de privacidad lo dice explícitamente.

## Consecuencias

- Menos riesgo y menos obligaciones legales, y un argumento de venta claro.
- **No podemos depurar un request mirando su contenido.** El soporte trabaja con el `request_id`, el estado y los códigos de error.
- No hay historial de conversaciones ni playground con memoria en el dashboard.
- No podemos detectar abuso por contenido. Si hiciera falta, se haría en el momento, sin guardar nada, y requeriría un ADR nuevo.

## Alternativas descartadas

- **Guardar el contenido por N días para depurar:** el valor para soporte no compensa el riesgo y las obligaciones.
- **Guardar el contenido solo si el usuario lo activa:** se puede reconsiderar si los usuarios lo piden, siempre como opción explícita y desactivada por defecto.
