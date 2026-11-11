# ADR-0027: Formato `wtf_` + checksum, guardadas como SHA-256

- **Estado:** Aceptada. Reemplaza a [ADR-0004](./0004-formato-api-keys.md).
- **Fecha:** 2026-11-10
- **Origen:** Usuario (prefijo) + Default (el resto del formato, que viene de ADR-0004)

## Contexto

- ADR-0004 fijó el formato de las API keys con un prefijo que venía de Deska. La marca ahora es `cheaptokens.wtf` ([ADR-0026](./0026-marca-cheaptokens-wtf.md)).
- Todavía no existe ninguna key. Cambiar el prefijo hoy no cuesta nada; después del lanzamiento obligaría a aceptar los dos prefijos para siempre.
- Lo demás no cambia: las API keys son nuestras ([ADR-0003](./0003-clerk-solo-dashboard.md)) y se validan en cada request, así que la validación tiene que ser barata, y una filtración de la base no debe exponer keys utilizables.

## Decisión

El formato de ADR-0004, con otro prefijo:

- **Formato:** `wtf_` + 32 bytes aleatorios en base62 (43 caracteres) + CRC32 de esa parte en base62 (6 caracteres). Son 53 caracteres en total.
- **Almacenamiento:** solo `SHA-256(key)` en hex, con índice único, y un `hint` (`wtf_` + 4 primeros caracteres + `…` + 4 últimos) para mostrarla en el dashboard.
- **Visibilidad:** la key en claro se muestra una sola vez, al crearla.
- **Revocación:** borrado suave (`revoked_at`), sin caché, con efecto inmediato.
- **Límite de gasto opcional** por key.

Detalle completo en [05 · API keys](../05-api-keys.md).

## Consecuencias

- El prefijo repite el TLD de la marca: en un log o en un `.env` se ve de quién es la key.
- **`wtf_` aparece en código que no tiene nada que ver** (variables, funciones en broma). Un escáner de secretos no puede buscar solo el prefijo: el patrón es `wtf_` + exactamente 49 caracteres base62, con checksum válido. Con el largo fijo y el checksum, los falsos positivos son casi imposibles.
- **Validación local:** el checksum descarta keys mal copiadas o inventadas sin tocar la base, lo que reduce el costo de los ataques de fuerza bruta.
- **Lookup barato:** SHA-256 + índice único resuelve la key en una query.
- Una filtración de la base no expone keys: con 256 bits de entropía, un hash rápido no se puede revertir por fuerza bruta.
- El prefijo y el checksum permiten, más adelante, registrarnos en programas de secret scanning.
- Una key perdida no se recupera: hay que crear otra.

## Alternativas descartadas

- **Mantener el prefijo de ADR-0004:** dejaría el nombre de Deska en cada key que se emita.
- **`ctk_` (iniciales de *cheap tokens*):** más neutro, pero a simple vista no dice de quién es la key.
- **bcrypt o argon2, HMAC con un pepper, guardar la key cifrada, UUID como key y keys `_live_` / `_test_`:** siguen descartadas por las razones de [ADR-0004](./0004-formato-api-keys.md#alternativas-descartadas).
