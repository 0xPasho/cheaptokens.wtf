# ADR-0003: Clerk solo para el dashboard, API keys propias

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Usuario

## Contexto

Hay dos tipos de acceso muy distintos:

- **Personas en el navegador** que entran al dashboard. Necesitan registro, login, sesiones, recuperación de cuenta y OAuth.
- **Programas** que llaman a `/v1/*` miles de veces. Necesitan una credencial estática, rápida de validar y revocable.

## Decisión

- **Clerk** maneja el registro, el login y las sesiones de la web.
- **Las API keys son nuestras:** las generamos, las guardamos (solo el hash) y las validamos nosotros ([ADR-0027](./0027-formato-api-keys-wtf.md)).
- **El gateway nunca llama a Clerk.** La relación entre los dos mundos es `workspaces.clerk_user_id`.
- `proxy.ts` usa `clerkMiddleware` para las páginas, y su matcher excluye `/v1/*`.

## Consecuencias

- El hot path no depende de la latencia ni de la disponibilidad de Clerk. Si Clerk se cae, la API sigue funcionando y solo el dashboard queda inaccesible.
- Controlamos el formato, el almacenamiento, los límites de gasto y la revocación de las keys.
- Tenemos que construir y asegurar nosotros la generación, el hash, la validación y el ciclo de vida de las keys.
- Hay que reaccionar a `user.deleted` de Clerk para revocar las keys de un usuario borrado.

## Alternativas descartadas

- **API keys de Clerk (machine auth o M2M):** el hot path pasaría a depender de un tercero y perderíamos control sobre el formato, el límite de gasto por key y la latencia.
- **JWT de sesión de Clerk para la API:** expiran en minutos y no sirven para scripts ni para servidores.
- **Auth propio también para el dashboard:** reinventar registro, OAuth, MFA y recuperación de cuenta no aporta nada al producto.
