# ADR-0076: `GET /v1/models` publica los niveles de `reasoning_effort` que acepta cada modelo

- **Estado:** Aceptada. Extiende el catálogo de [ADR-0055](./0055-catalogo-en-vivo-con-varios-proveedores.md) y sigue la regla de rutas de [ADR-0067](./0067-salida-maxima-por-modelo.md).
- **Fecha:** 2026-11-24
- **Origen:** Usuario (Deska tiene que ofrecer el esfuerzo de cada modelo, Claude, GPT y los demás, solo con los niveles que acepta) + Default (el nombre del campo, la intersección entre rutas y qué pasa cuando una ruta no los reporta)

## Contexto

- El gateway pasa `reasoning_effort` a la ruta tal cual. Cada ruta acepta sus propios niveles: Claude `low` a `high`, GPT hasta `xhigh` o `max`, algunas con `none`, Kimi y GLM sin `medium`. Un nivel que la ruta no acepta puede fallar.
- `GET /v1/models` de InferHub trae `reasoning_levels` por ruta. El 2026-11-24, 55 de los 97 modelos activos tenían al menos un nivel en su ruta elegida.
- El catálogo solo guardaba el tag `reasoning`, que no dice qué niveles hay. Un cliente (Deska Harness) no podía saber qué ofrecer, y la ruta de cada modelo cambia con el precio, así que una lista fija en el cliente envejece.

## Decisión

- **`CatalogEntry.reasoningLevels`** guarda los niveles que reporta el proveedor. El import de InferHub los toma de `reasoning_levels` de la ruta elegida, sin repetidos y en su orden. Una ruta sin la lista, o con un valor inválido, no declara ninguno (`[]`): el catálogo no se cae.
- **Con varias rutas,** el modelo se queda con los niveles que aceptan todas las que sirven, porque el fallback puede terminar en cualquiera. Una ruta descartada por precio no cuenta.
- **Si alguna ruta no los trae** (solo pasa con la instantánea del repo o una base anterior a la columna), se conserva lo que ya estaba, como `max_output_tokens`.
- **La base** los guarda en `models.reasoning_levels` (`text[]`, null: no se sabe; migración `0006`). La sincronización los escribe cuando el catálogo los trae y no los toca cuando no. Un cambio de niveles es un cambio público del catálogo: se revalida el sitio.
- **`GET /v1/models`** publica `reasoning_levels` en cada modelo cuyos niveles se conocen: los nombres de InferHub (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`). `[]` significa que no acepta ninguno; sin el campo, no se sabe.
- **El gateway no cambia:** no valida ni traduce `reasoning_effort`.

## Consecuencias

- Deska Harness lee el campo y ofrece en el control de esfuerzo exactamente los niveles de la ruta que sirve el modelo, y sigue los cambios de ruta sin publicar una versión nueva.
- Cualquier cliente puede saber antes de llamar qué `reasoning_effort` manda sin error.
- El primer refresco tras el deploy escribe los niveles de todos los modelos (un cambio de catálogo, una sola vez).
- Un modelo cuya ruta elegida no reporta niveles se publica con `[]` aunque otra ruta de InferHub sí los tenga. Por ejemplo, GPT 6 Luna el 2026-11-24.

## Alternativas descartadas

- **La lista en el cliente:** envejece cada vez que el precio cambia la ruta y puede mandar un nivel que la ruta nueva no acepta.
- **La unión de las rutas:** una ruta de respaldo podría rechazar un nivel que solo acepta otra.
- **Traducir o recortar `reasoning_effort` en el gateway:** cambia lo que pidió el cliente sin decírselo.
