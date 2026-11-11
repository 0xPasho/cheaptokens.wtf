# ADR-0016: El workspace es dueño del saldo y las keys, con cuentas personales

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

En el MVP cada usuario usa su propia cuenta. Más adelante es probable que haya equipos que comparten saldo y keys. Si el saldo y las keys cuelgan directamente del usuario, agregar organizaciones después obliga a una migración de datos con dinero de por medio.

## Decisión

- La entidad dueña del saldo, las keys, los requests y las recargas es el **workspace**, no el usuario.
- En el MVP hay **un workspace por usuario de Clerk** (`workspaces.clerk_user_id` único). Se crea de forma perezosa en el primer acceso autenticado al dashboard.
- No hay organizaciones, invitaciones ni roles.

## Consecuencias

- Agregar organizaciones (fase 3) significa permitir varios miembros por workspace, sin tocar las tablas de dinero.
- Toda query del dashboard filtra por el `workspace_id` resuelto en el servidor, nunca por un ID que mande el cliente.
- Crear el workspace de forma perezosa evita depender del webhook `user.created` de Clerk. Solo `user.deleted` es necesario.

## Alternativas descartadas

- **Saldo y keys colgando del usuario:** agregar equipos después sería una migración con dinero.
- **Clerk Organizations desde el día uno:** más interfaz (invitaciones, roles, cambio de organización) que nadie pidió para el MVP.
