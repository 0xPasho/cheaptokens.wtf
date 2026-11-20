# ADR-0050: Login con Clerk cuando está configurado, y un modo de desarrollo solo en local

- **Estado:** Aceptada. Amplía [ADR-0003](./0003-clerk-solo-dashboard.md). [ADR-0063](./0063-una-sola-ventana-de-acceso.md) cambió la pantalla de acceso: una sola ventana con código por correo, también en el modo de desarrollo.
- **Fecha:** 2026-11-15
- **Origen:** Usuario

## Contexto

- [ADR-0003](./0003-clerk-solo-dashboard.md) eligió Clerk para el login de la web. El dashboard ya existe, pero la instancia de Clerk del dueño todavía no: faltan las claves y el dominio registrado ([12 · Preguntas abiertas](../12-preguntas-abiertas.md)).
- Sin login, el dashboard no se puede usar ni probar en local.
- `pnpm keys:create --workspace <nombre>` ya crea workspaces `dev:<nombre>` para probar el gateway.
- Un login sin verificación en un deploy público dejaría entrar a cualquier cuenta escribiendo su nombre.

## Decisión

- **Tres modos** (`getAuthMode` en `src/lib/auth/mode.ts`):
  - **`clerk`:** cuando existen `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY`. Es el único modo que deja entrar en preview y producción.
  - **`dev`:** sin Clerk y con `APP_ENV=development`. En Vercel manda `VERCEL_ENV`; sin ninguna de las dos, la app se considera de desarrollo.
  - **`none`:** preview o producción sin Clerk. `/[lang]/sign-in` avisa que faltan las claves y nadie puede entrar.
- **Clerk solo se carga en modo `clerk`.** `AuthProvider` (`src/components/site/auth-provider.tsx`) monta `ClerkProvider`, con `esES` de `@clerk/localizations` en `es`. `src/proxy.ts` solo usa `clerkMiddleware` entonces. El matcher sigue dejando fuera `/v1` y `/api`.
- **Modo de desarrollo:** `/[lang]/sign-in` pide un nombre o correo (`[a-z0-9._@-]`, hasta 64 caracteres). Una server action (`src/app/[lang]/(site)/sign-in/actions.ts`) guarda la cookie httpOnly `ct_dev_session`, que abre el workspace `dev:<nombre>`, el mismo de `pnpm keys:create`. Una segunda cookie, `ct_dev_identity`, legible en el navegador, solo pinta el menú de cuenta en las páginas estáticas. No autoriza nada.
- **Proteger el dashboard:** sin sesión, el proxy manda `/{lang}/dashboard…` a `/{lang}/sign-in?redirect_url=…`. El proxy no es la autorización: cada página y cada server action vuelve a leer la sesión (`requireDashboard` y `actionSession` en `src/lib/dashboard/session.ts`). El regreso solo acepta rutas propias del mismo idioma.
- **Workspace perezoso:** se crea en la primera visita al dashboard (`getOrCreateWorkspace` en `src/lib/auth/workspace.ts`), con `clerk_user_id` igual al ID de Clerk o a `dev:<nombre>`. Un workspace borrado no se vuelve a crear.
- **Cerrar sesión:** `signOut` de Clerk, o una server action que borra las dos cookies (`src/components/dashboard/sign-out.tsx`). Está en el menú de cuenta y en Ajustes.
- **`user.deleted`:** `POST /api/webhooks/clerk` (`src/app/api/webhooks/clerk/route.ts`) verifica la firma con `CLERK_WEBHOOK_SIGNING_SECRET`, marca el workspace como borrado y revoca sus keys en una transacción. Repetir el evento no cambia nada.
- **El menú de cuenta se resuelve en el navegador** (`src/components/site/account-control.tsx`), con `useUser` de Clerk o con la cookie de identidad. Así las páginas públicas siguen estáticas; el detalle de modelo lo exige con `ensureStatic`.

## Consecuencias

- El dashboard se usa y se prueba hoy, sin cuenta de Clerk.
- Conectar Clerk es poner tres variables de entorno ([`.env.example`](../../.env.example)). No hay que tocar código.
- **Sin Clerk, un preview no tiene login.** Para probar el dashboard en un preview hace falta una instancia de Clerk, aunque sea la de desarrollo.
- **El riesgo del modo de desarrollo está en la configuración:** fuera de Vercel, un deploy sin `APP_ENV` cuenta como desarrollo y deja entrar con cualquier nombre (y con pagos de desarrollo, [ADR-0049](./0049-suscripcion-con-limites.md)). Un servidor propio debe poner `APP_ENV=production`.
- `/[lang]/sign-in` y `/[lang]/sign-up` no se prerenderizan: Clerk usa subrutas que solo existen al pedirlas.
- `workspaces.clerk_user_id` también guarda `dev:<nombre>`. No choca con los IDs de Clerk, que empiezan con `user_`.

## Alternativas descartadas

- **Esperar la instancia de Clerk para construir el dashboard:** bloquea el trabajo por algo que no cambia el diseño.
- **Usar una instancia de desarrollo de Clerk también en local:** cada desarrollador dependería de una cuenta, de claves y de la red. El modo de desarrollo no necesita nada.
- **Modo de desarrollo también en preview, con una contraseña compartida:** un preview es público. Un secreto compartido termina filtrado y abre todas las cuentas.
- **Resolver la sesión en el servidor para pintar la cabecera:** leer cookies en el layout vuelve dinámicas todas las páginas públicas, incluido el catálogo.
- **Auth propio (contraseñas, magic links):** sigue descartado por ADR-0003.
