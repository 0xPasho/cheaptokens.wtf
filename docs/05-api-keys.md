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
- `billing_source`, `allowed_models` y `expires_at` ([Fuente de cobro y modelos](#fuente-de-cobro-y-modelos), [Rotar](#rotar)).

**La key en claro no se guarda nunca**, ni en la base, ni en logs, ni en analytics.

¿Por qué SHA-256 y no bcrypt o argon2? Los hashes lentos existen para contraseñas de baja entropía, que se pueden adivinar. Una key de 256 bits aleatorios no se puede adivinar ni con un hash rápido, y SHA-256 permite buscarla por índice en O(1) en cada request. Un hash lento agregaría decenas de milisegundos al hot path sin mejorar la seguridad. Detalle en [ADR-0027](./adr/0027-formato-api-keys-wtf.md).

## Ciclo de vida

### Crear

1. El usuario, con sesión iniciada ([ADR-0050](./adr/0050-login-clerk-y-modo-desarrollo.md)), pide una key nueva desde `/dashboard/keys` con nombre, límite opcional, fuente de cobro y modelos permitidos.
2. Una Server Function vuelve a leer la sesión y resuelve el workspace.
3. Se genera la key, se calculan `hash` y `hint`, y se inserta la fila.
4. **La key en claro se devuelve una sola vez** al modal. Si se pierde, no se puede recuperar: se crea otra.

Límite: 25 keys activas por workspace.

### Usar

En cada request a `/v1/*` ([03 · Arquitectura](./03-arquitectura.md#flujo-de-un-request-al-gateway)):

1. Se lee `Authorization: Bearer <key>`.
2. **Validación local, sin red:** prefijo `wtf_`, largo 53, alfabeto base62 y checksum correcto. Si algo falla, `401 invalid_api_key`.
3. Se calcula `SHA-256(key)` y una sola query trae la key y su workspace.
4. Si no existe, tiene `revoked_at` o ya pasó su `expires_at`, `401 invalid_api_key`. El mensaje es el mismo en todos los casos, para no revelar si una key existió.
5. Si `allowed_models` no es nulo y no incluye el modelo pedido, `403 model_not_allowed_for_key`.
6. Si `spend_limit_micro_usd` no es nulo y `spent_micro_usd ≥ spend_limit_micro_usd`, `403 key_limit_exceeded`.
7. Después se decide si el plan, un paquete o los créditos pueden pagarlo ([08 · Créditos › Cobro por request](./08-creditos-y-pagos.md#cobro-por-request)).

### Fuente de cobro y modelos

Cada key elige de dónde cobra (`billing_source`, [ADR-0049](./adr/0049-suscripcion-con-limites.md)):

| Valor | En el dashboard | Qué hace |
|---|---|---|
| `plan_then_prepaid` (default) | Plan y créditos | Usa el plan primero. Al llegar al límite sigue según el excedente del workspace |
| `plan_only` | Solo plan | Nunca toca paquetes ni créditos. Al llegar al límite, `429 usage_limit_reached`; sin plan activo, `402 no_active_plan` |
| `prepaid_only` | Solo créditos | Nunca gasta el límite del plan. Paga con paquetes y créditos. Pensada para CI y producción |

`allowed_models` es null (todos los modelos) o una lista no vacía de IDs. Cualquier otro modelo responde `403 model_not_allowed_for_key`.

El límite de gasto de la key cuenta todo su costo, venga del plan, de un paquete o de créditos.

### Registrar uso

En la misma transacción de cobro ([08 · Créditos](./08-creditos-y-pagos.md#cobro-por-request)):

```sql
UPDATE api_keys
SET spent_micro_usd = spent_micro_usd + $cost,
    last_used_at    = now()
WHERE id = $key_id;
```

### Rotar

- Desde el dashboard, con confirmación. Se crea una key nueva con el mismo nombre, límite, fuente de cobro y modelos, y se muestra una sola vez.
- La key anterior recibe `expires_at = now() + 24 h`: sigue funcionando 24 horas para cambiarla sin cortes. Después responde `401 invalid_api_key`.
- Una key que ya tiene `expires_at` no se puede volver a rotar. Se puede revocar antes de que venza.
- El límite de 25 keys activas cuenta las que no están revocadas, así que una key rotada sigue contando aunque ya haya vencido. Revocarla libera el lugar.

### Revocar

- Desde el dashboard, con confirmación. Se marca `revoked_at = now()` (borrado suave, así el historial de uso conserva la referencia).
- **El efecto es inmediato:** no hay caché de keys, así que el request siguiente ya falla. Si en el futuro se agrega un caché, su TTL debe ser de 30 s o menos, y la revocación debe invalidarlo.
- Cuando Clerk avisa que se borró un usuario (`user.deleted`), se revocan todas sus keys.
- Cuando se suspende un workspace, las keys no se revocan, pero el gateway responde `403 account_suspended`.

## Lo que el MVP no tiene (y cuándo llegaría)

| Función | Cuándo |
|---|---|
| Restricción por IP | Fase 3 |
| Keys de prueba (`wtf_test_`) que no cobran | Solo si hay demanda |
| Registro en el programa de secret scanning de GitHub (revocación automática de keys filtradas en repos públicos) | Fase 3, el prefijo `wtf_` y el checksum ya lo permiten |

## Riesgos conocidos

- **Contención de filas.** Una key con mucho volumen actualiza la misma fila de `api_keys` y de `workspaces` en cada request. Es aceptable en el MVP. Si duele: acumular gasto en Redis y volcarlo a Postgres en lotes.
- **Key filtrada.** El usuario puede revocarla al instante y ponerle un límite de gasto preventivo. El dashboard sugiere un límite al crear keys para scripts o CI.
