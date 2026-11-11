# 05 · API keys

Las API keys son **nuestras**: las generamos, las guardamos y las validamos nosotros. Clerk no participa ([ADR-0003](./adr/0003-clerk-solo-dashboard.md), [ADR-0027](./adr/0027-formato-api-keys-wtf.md)).

## Formato

```
wtf_<43 caracteres aleatorios base62><6 caracteres de checksum base62>
```

Ejemplo de forma (no es una key real): `wtf_4f8KzQ1mN0pX7rT2vB9cL6wE3yH5jA8sD1gF0kU2nR7tQb3Zx`

| Parte | Contenido | Para qué |
|---|---|---|
| `wtf_` | Prefijo fijo | Reconocer una key de cheaptokens.wtf a simple vista, en logs y en escáneres de secretos |
| 43 caracteres | 32 bytes de `crypto.randomBytes`, en base62 con largo fijo | 256 bits de entropía: imposible de adivinar |
| 6 caracteres | CRC32 (IEEE) de los 43 caracteres de la parte aleatoria como texto ASCII, en base62 con ceros a la izquierda | Rechazar keys mal copiadas o inventadas sin consultar la base. **Queda fijo con la primera key emitida:** cambiarlo invalida todas |

Largo total: 53 caracteres. El alfabeto base62 (`0-9A-Za-z`) permite copiar la key con doble clic, sin guiones ni símbolos.

## Almacenamiento

Por cada key se guarda ([09 · Modelo de datos](./09-modelo-de-datos.md#api_keys)):

- `hash`: **SHA-256 de la key completa**, en hex, con índice único.
- `hint`: `wtf_` + 4 primeros caracteres aleatorios + `…` + 4 últimos (`wtf_4f8K…b3Zx`). Sirve para que el usuario la reconozca en la lista.
- `name`, `spend_limit_micro_usd` (opcional), `spent_micro_usd`, `last_used_at`, `created_at`, `revoked_at`.

**La key en claro no se guarda nunca**, ni en la base, ni en logs, ni en analytics.

¿Por qué SHA-256 y no bcrypt o argon2? Los hashes lentos existen para contraseñas de baja entropía, que se pueden adivinar. Una key de 256 bits aleatorios no se puede adivinar ni con un hash rápido, y SHA-256 permite buscarla por índice en O(1) en cada request. Un hash lento agregaría decenas de milisegundos al hot path sin mejorar la seguridad. Detalle en [ADR-0027](./adr/0027-formato-api-keys-wtf.md).

## Ciclo de vida

### Crear

1. El usuario, autenticado con Clerk, pide una key nueva desde `/dashboard/keys` con nombre y límite opcional.
2. Una Server Function verifica la sesión con `auth()` y resuelve el workspace.
3. Se genera la key, se calculan `hash` y `hint`, y se inserta la fila.
4. **La key en claro se devuelve una sola vez** al modal. Si se pierde, no se puede recuperar: se crea otra.

Límite: 25 keys activas por workspace.

### Usar

En cada request a `/v1/*` ([03 · Arquitectura](./03-arquitectura.md#flujo-de-un-request-al-gateway)):

1. Se lee `Authorization: Bearer <key>`.
2. **Validación local, sin red:** prefijo `wtf_`, largo 53, alfabeto base62 y checksum correcto. Si algo falla, `401 invalid_api_key`.
3. Se calcula `SHA-256(key)` y una sola query trae la key y su workspace.
4. Si no existe o tiene `revoked_at`, `401 invalid_api_key`. El mensaje es el mismo en los dos casos, para no revelar si una key existió.
5. Si `spend_limit_micro_usd` no es nulo y `spent_micro_usd ≥ spend_limit_micro_usd`, `403 key_limit_exceeded`.

### Registrar uso

En la misma transacción de cobro ([08 · Créditos](./08-creditos-y-pagos.md#cobro-por-request)):

```sql
UPDATE api_keys
SET spent_micro_usd = spent_micro_usd + $cost,
    last_used_at    = now()
WHERE id = $key_id;
```

### Revocar

- Desde el dashboard, con confirmación. Se marca `revoked_at = now()` (borrado suave, así el historial de uso conserva la referencia).
- **El efecto es inmediato:** no hay caché de keys, así que el request siguiente ya falla. Si en el futuro se agrega un caché, su TTL debe ser de 30 s o menos, y la revocación debe invalidarlo.
- Cuando Clerk avisa que se borró un usuario (`user.deleted`), se revocan todas sus keys.
- Cuando se suspende un workspace, las keys no se revocan, pero el gateway responde `403 account_suspended`.

## Lo que el MVP no tiene (y cuándo llegaría)

| Función | Cuándo |
|---|---|
| Rotación con período de gracia (key vieja y nueva válidas por N horas) | Fase 2 |
| Restricción por modelo (una key solo puede usar ciertos modelos) | Fase 2 |
| Restricción por IP | Fase 3 |
| Keys de prueba (`wtf_test_`) que no cobran | Solo si hay demanda |
| Registro en el programa de secret scanning de GitHub (revocación automática de keys filtradas en repos públicos) | Fase 3, el prefijo `wtf_` y el checksum ya lo permiten |

## Riesgos conocidos

- **Contención de filas.** Una key con mucho volumen actualiza la misma fila de `api_keys` y de `workspaces` en cada request. Es aceptable en el MVP. Si duele: acumular gasto en Redis y volcarlo a Postgres en lotes.
- **Key filtrada.** El usuario puede revocarla al instante y ponerle un límite de gasto preventivo. El dashboard sugiere un límite al crear keys para scripts o CI.
