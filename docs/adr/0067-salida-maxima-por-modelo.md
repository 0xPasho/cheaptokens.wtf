# ADR-0067: Sin `max_tokens` del cliente, el tope es la salida máxima de cada modelo según el proveedor

- **Estado:** Aceptada. Reemplaza, de [ADR-0066](./0066-reserva-por-request.md), el default de 32 768 para todos los modelos y «`catalog:sync` no lo toca».
- **Fecha:** 2026-11-22
- **Origen:** Usuario

## Contexto

- ADR-0066 manda `max_tokens: 32768` cuando el cliente no fija salida, salvo que `models.max_output_tokens` tenga un valor. Ningún proceso llenaba esa columna, así que el tope era 32 768 para todos.
- Directo en InferHub, un request sin `max_tokens` no tiene ese tope. Un modelo de razonamiento que piensa mucho se cortaba antes con nosotros que con InferHub.
- `GET /v1/models` de InferHub trae `max_output_tokens` por ruta. El 2026-11-22, 77 de los 97 modelos activos lo reportaban, entre 32 000 y 524 288.
- Quitar el tope no es opción: sin `max_tokens` no se sabe cuánto reservar y vuelve la pérdida que ADR-0066 cerró.

## Decisión

- **`CatalogEntry.maxOutputTokens`** guarda la salida máxima que reporta el proveedor. El import de InferHub la toma de `max_output_tokens` de la ruta elegida. Un valor que no sea entero positivo se ignora sin tumbar el catálogo.
- **Con varios proveedores,** el modelo se queda con la menor de las rutas que sirven, porque el fallback puede terminar en cualquiera. Una ruta descartada por precio no cuenta.
- **Si ninguna ruta la reporta,** se conserva la que ya estaba en la base. Así sobrevive un valor fijado a mano y el cron no reescribe cada minuto.
- **La sincronización escribe `models.max_output_tokens`** cuando el catálogo trae el valor, y no lo toca cuando no lo trae. El `catalog:sync` del deploy, con la instantánea del repo, no borra lo que dejó el cron.
- **El gateway no cambia:** ya usaba `models.max_output_tokens` como salida por defecto y como tope de lo que pide el cliente, y 32 768 cuando es null.

## Consecuencias

- Sin `max_tokens`, un modelo genera hasta su máximo real, como en InferHub. Por ejemplo, Claude Opus 5.5 pasa de 32 768 a 128 000.
- **Cada request sin `max_tokens` reserva más.** Con Opus 5.5 la salida reserva cerca de $0.51 en vez de $0.13, más el prompt. En Plus ($1.26 por ventana de 5 horas) caben unos dos requests a la vez a tamaño completo, y el siguiente sale recortado o con `429` hasta que termine uno. Antes cabían unos nueve. Los requests secuenciales no cambian.
- Si el cliente pide más que el máximo del modelo, el upstream recibe el máximo. El resultado es el mismo, porque el modelo no puede generar más.
- Un modelo que InferHub reporta mal hereda ese error. Se corrige fijando `models.max_output_tokens` a mano solo si InferHub deja de reportarlo; mientras lo reporte, gana su valor.
- Los 20 modelos sin valor siguen en 32 768.

## Alternativas descartadas

- **No mandar `max_tokens` cuando el cliente no lo fija:** idéntico a InferHub, pero la reserva deja de acotar el costo y vuelve la pérdida de ADR-0066.
- **Dejar 32 768 para todos:** corta antes que InferHub los modelos que pueden generar más.
- **Tomar la mayor de las rutas:** una ruta de respaldo con un máximo menor podría rechazar el `max_tokens`.
