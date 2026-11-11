# ADR-0006: Postgres en Neon con Drizzle

- **Estado:** Reemplazada por [ADR-0032](./0032-postgres-node-postgres-y-pglite.md) el 2026-11-10: se mantienen Neon y Drizzle, pero el driver es node-postgres y en local se usa PGlite.
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

Necesitamos transacciones atómicas para mover dinero (saldo + request + gasto de la key), índices únicos para la idempotencia y para el hash de las keys, y SQL para la conciliación y los reportes. Además, la base debe funcionar bien desde funciones serverless de Vercel.

## Decisión

- **Postgres en Neon**, en la misma región que las funciones de Vercel, con el driver serverless de Neon.
- **Drizzle ORM** para el esquema, las migraciones y las queries tipadas.

## Consecuencias

- Las transacciones ACID resuelven el cobro atómico y la idempotencia de los webhooks.
- El esquema vive en TypeScript, en `src/lib/db/schema.ts`, con migraciones versionadas en el repo.
- Neon permite crear branches de la base para cada preview de Vercel.
- Hay que vigilar la contención de filas en `workspaces` y `api_keys` cuando una sola key tenga mucho volumen ([05 · API keys](../05-api-keys.md#riesgos-conocidos)).

## Alternativas descartadas

- **Supabase:** también es Postgres, pero trae auth, storage y realtime que no vamos a usar (el auth es de Clerk). Neon es solo la base.
- **Cloudflare D1 (SQLite):** solo tendría sentido con el gateway en Workers ([ADR-0005](./0005-gateway-en-nextjs-vercel.md)). Para dinero y reportes preferimos Postgres.
- **Prisma:** un runtime más pesado en serverless y menos control sobre el SQL generado. Drizzle está más cerca del SQL.
- **Una base NoSQL (DynamoDB, Mongo):** las transacciones entre varias entidades y la conciliación con SQL son centrales en este producto.
