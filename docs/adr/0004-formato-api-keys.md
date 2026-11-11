# ADR-0004: Formato `dsk_` + checksum, guardadas como SHA-256

- **Estado:** Reemplazada por [ADR-0027](./0027-formato-api-keys-wtf.md) el 2026-11-10: el prefijo cambia con la marca. El resto del formato sigue igual.
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

Construimos nuestras propias API keys ([ADR-0003](./0003-clerk-solo-dashboard.md)). Se validan en cada request, así que la validación tiene que ser barata, y una filtración de la base no debe exponer keys utilizables.

## Decisión

- **Formato:** `dsk_` + 32 bytes aleatorios en base62 (43 caracteres) + CRC32 de esa parte en base62 (6 caracteres). Son 53 caracteres en total.
- **Almacenamiento:** solo `SHA-256(key)` en hex, con índice único, y un `hint` (`dsk_` + 4 primeros caracteres + `…` + 4 últimos) para mostrarla en el dashboard.
- **Visibilidad:** la key en claro se muestra una sola vez, al crearla.
- **Revocación:** borrado suave (`revoked_at`), sin caché, con efecto inmediato.
- **Límite de gasto opcional** por key.

Detalle completo en [05 · API keys](../05-api-keys.md).

## Consecuencias

- **Validación local:** el checksum descarta keys mal copiadas o inventadas sin tocar la base, lo que reduce el costo de los ataques de fuerza bruta.
- **Lookup barato:** SHA-256 + índice único resuelve la key en una query.
- Una filtración de la base no expone keys: con 256 bits de entropía, un hash rápido no se puede revertir por fuerza bruta.
- El prefijo `dsk_` y el checksum permiten, más adelante, registrarnos en programas de secret scanning.
- Una key perdida no se recupera: hay que crear otra.

## Alternativas descartadas

- **bcrypt o argon2:** existen para contraseñas de baja entropía. Con 256 bits aleatorios no agregan seguridad, cuestan decenas de milisegundos por request y no permiten buscar por índice (habría que guardar un ID aparte en la key).
- **HMAC-SHA256 con un pepper del servidor:** con esta entropía no protege contra ningún ataque real y suma un secreto más que rotar.
- **Guardar la key cifrada para poder mostrarla otra vez:** si se roban la base y la llave de cifrado, todas las keys quedan expuestas. Mostrarla una vez es el estándar de la industria.
- **UUID como key:** tiene menos entropía (122 bits), no tiene prefijo reconocible ni checksum, y los guiones complican copiarla con doble clic.
- **Keys `dsk_live_` / `dsk_test_`:** no hay modo de prueba en el MVP. Reservar el prefijo sería alargar la key sin uso.
