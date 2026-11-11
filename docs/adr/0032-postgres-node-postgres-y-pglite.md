# ADR-0032: Postgres con Drizzle y node-postgres; PGlite en desarrollo y pruebas

- **Estado:** Aceptada. Reemplaza a [ADR-0006](./0006-postgres-neon-drizzle.md).
- **Fecha:** 2026-11-10
- **Origen:** Default (propuesto en [15 · Plan](../15-plan-gateway.md) y guardado a pedido del dueño)

## Contexto

- [ADR-0006](./0006-postgres-neon-drizzle.md) eligió Postgres en Neon con Drizzle y el driver serverless de Neon. La razón de Postgres sigue igual: transacciones para mover dinero, índices únicos para la idempotencia y SQL para conciliar.
- Para construir el gateway hace falta una base **hoy**, en la máquina del dueño y en las pruebas. No hay Docker ni `psql` instalados, ni cuenta de Neon.
- Los ejecutores del plan corren en paralelo y cada uno necesita una base aislada y rápida para sus pruebas.
- En Vercel con Fluid compute, una instancia atiende muchos requests y mantiene sus conexiones abiertas. Un pool TCP normal funciona bien ahí.

## Decisión

- **Postgres con Drizzle,** igual que antes. **Neon** para previews y producción.
- **Driver: node-postgres (`pg`) con `drizzle-orm/node-postgres` en todos lados.** Neon acepta conexiones TCP normales. El pool se registra como lo recomiende Vercel para Fluid compute (se verifica en su documentación al hacer el deploy).
- **Desarrollo local:** PGlite expuesto con el protocolo de Postgres (`pglite-socket` o equivalente). Así `next dev` y los scripts usan un `DATABASE_URL` normal, igual que con Neon.
- **Pruebas unitarias:** PGlite en memoria con `drizzle-orm/pglite` y las migraciones aplicadas, una base nueva por archivo de prueba.
- **El tipo `Db` del código es el de Postgres de Drizzle,** común a los dos drivers. Ningún módulo depende de cuál se usa.
- **Plan B:** si PGlite con protocolo de Postgres no funciona bien con `next dev`, se usa una rama de desarrollo en Neon. Esa cuenta la crea el dueño.

## Consecuencias

- El gateway se construye y se prueba sin cuentas, sin Docker y sin red.
- Las pruebas de cada ejecutor son aisladas y rápidas: no hay base compartida que limpiar.
- **PGlite no es idéntico a Postgres en todo** (extensiones, concurrencia real). La prueba de carga concurrente del plan corre igual contra PGlite, y antes de producción se repite contra una rama de Neon.
- Se pierde la ventaja del driver HTTP de Neon en entornos sin conexiones persistentes. Con Fluid compute no hace falta.

## Alternativas descartadas

- **Driver serverless de Neon ([ADR-0006](./0006-postgres-neon-drizzle.md)):** sería un driver distinto en local y en producción, y en modo HTTP no tiene transacciones interactivas.
- **Postgres en Docker:** Docker no está instalado. Sería otra dependencia para el dueño y para cada ejecutor.
- **Neon desde el primer día para todo:** obliga a crear la cuenta antes de empezar y hace que las pruebas dependan de la red.
- **SQLite en local:** otro dialecto. Las migraciones y el SQL de conciliación tendrían que existir dos veces.
