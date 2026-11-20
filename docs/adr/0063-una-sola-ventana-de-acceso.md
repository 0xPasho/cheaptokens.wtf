# ADR-0063: Una sola ventana para entrar o crear cuenta, con código por correo

- **Estado:** Aceptada. Cambia la pantalla y el flujo de acceso de [ADR-0050](./0050-login-clerk-y-modo-desarrollo.md). Los tres modos, la sesión, el workspace y el webhook de ese ADR siguen igual.
- **Fecha:** 2026-11-18
- **Origen:** Usuario (una sola ventana, que el link de crear cuenta solo cambie el texto y la pantalla del código) + Default (que la cuenta nazca al verificar, el flujo de Clerk, la misma ventana en desarrollo y a dónde llevan los botones)

## Contexto

- `/sign-in` y `/sign-up` mostraban los componentes de Clerk debajo del título de la página: dos títulos, «Secured by Clerk» y un estilo que no era el del sitio.
- Quien escribía su correo en «Iniciar sesión» sin tener cuenta tenía que empezar de nuevo en «Crear cuenta».
- La instancia de producción de Clerk ya entra solo con un código por correo. No hay contraseña ni redes sociales, y el registro solo pide el correo.

## Decisión

- **Una ventana, tres pasos:** correo, código de seis dígitos y listo. La pinta `AuthWindow` (`src/components/auth/auth-window.tsx`) con los átomos del sitio y la tarjeta en dos capas del catálogo ([ADR-0042](./0042-tarjetas-de-modelos-en-dos-capas.md)). Hay un solo título.
- **El correo decide.** Si tiene cuenta, entra. Si no, la cuenta se crea al verificar el código. No hay otra pantalla ni otro botón que pulsar.
- **«Crear cuenta» solo cambia el texto:** el título, la descripción y el propio link. `/sign-up` es la misma ventana con ese texto. El link reemplaza la URL sin navegar (`history.replaceState`), así no se pierde lo escrito y recargar conserva el modo.
- **La pantalla del código es igual para todos.** No dice si el correo ya tenía cuenta. «Sesión iniciada» o «Cuenta creada» aparece después de verificar.
- **Con Clerk** (`src/lib/auth/clerk-flow.ts`) se usa su flujo propio con `signUpIfMissing`:
  1. `signIn.create({ identifier, signUpIfMissing: true })` y `signIn.emailCode.sendCode()`. El código se envía tenga o no cuenta el correo.
  2. `signIn.emailCode.verifyCode({ code })`. Si el intento queda `complete`, la cuenta existía.
  3. Si Clerk responde `sign_up_if_missing_transfer`, el correo no tenía cuenta: `signUp.create({ transfer: true })` la crea con el correo ya verificado.
  4. `finalize()` abre la sesión y navega a la ruta de regreso.
- **Sin Clerk, en desarrollo local** ([ADR-0050](./0050-login-clerk-y-modo-desarrollo.md)), es la misma ventana. Pide un nombre o correo y cualquier código de seis dígitos entra; `000000` muestra el error de código incorrecto. No envía correos. La server action `devVerifyAction` vuelve a validar todo y deja las dos cookies.
- **El código es un solo campo** (átomo `InputOTP` de shadcn) con seis casillas dibujadas encima. Se puede pegar (`123-456` vale), se autocompleta desde el correo y se envía solo al sexto dígito. Reenviar se habilita a los 30 segundos. Un código incorrecto queda seleccionado: escribir encima lo reemplaza. Mientras se verifica un código no se puede cambiar de correo: esa verificación ya no se cancela, y si resulta buena la sesión o la cuenta ya existen.
- **Con sesión abierta, la ventana no se muestra.** El proxy manda a `redirect_url` o al dashboard. `redirect_url` solo acepta rutas propias del mismo idioma, y nunca la propia ventana (`safeRedirectPath` en `src/lib/auth/redirect.ts`). La ruta se revisa ya resuelta, como la lee el navegador: `/es/../en/dashboard` no pasa. El proxy solo redirige las visitas (`GET`). Las server actions que la ventana envía por `POST` llegan aunque ya haya sesión: Clerk envía una al abrirla.
- **«Listo» no se conserva.** Next no desmonta la página al navegar: la oculta y la vuelve a mostrar con su estado. Si la ventana se oculta en «Listo», vuelve al primer paso. Sin eso, quien cierra sesión y vuelve a «Iniciar sesión» vería «Sesión iniciada» para siempre. A medio camino, en el correo o en el código, lo escrito se conserva. Si abrir la sesión tarda más de 30 segundos, la ventana ofrece reintentar.
- **Si el script de Clerk no carga** (un bloqueador de contenido, la red), la ventana lo dice y pide recargar la página. Sin esa comprobación, el botón se quedaría girando: los métodos de Clerk esperan a que su script cargue.
- **Antes de que cargue el JavaScript, la ventana ya se ve:** es una página estática. Si alguien escribe y pulsa Enter en ese momento, React guarda el envío y lo repite cuando ya puede atenderlo (`action` del formulario). Sin eso, el navegador enviaría el formulario por su cuenta: recargaría la página con el correo en la URL y sin la ruta de regreso. Al enviar se lee lo que hay escrito en el campo, no el estado de React: también sirve cuando un gestor de contraseñas rellena sin avisar.
- **«Obtén tu API key»** (cabecera, landing y `/faq`) abre `/sign-up?redirect_url=…/dashboard/keys`. Quien no tiene sesión ve «Crea tu cuenta» y, al terminar, llega a sus keys. Quien ya la tiene llega directo.
- **Accesibilidad:** el foco se ve en el campo, en las casillas y en los links. El foco sigue al paso: al código para escribirlo y al título al terminar. Los errores van junto al campo, con icono y `aria-describedby`, y una región `role="status"` los anuncia. La entrada entre pasos dura 220 ms y no corre con movimiento reducido.

## Consecuencias

- Las rutas `/sign-in/[[...sign-in]]` y `/sign-up/[[...sign-up]]` pasan a `/sign-in` y `/sign-up`. Ya no hay subrutas de Clerk y las dos páginas son estáticas.
- **La ventana depende de cómo está configurada la instancia de Clerk:** el correo como único identificador, código por correo como primer factor y registro abierto que solo pide el correo. Con contraseña, nombre obligatorio, términos, segundo factor u organizaciones, el flujo no puede terminar: muestra un error y deja el motivo en la consola (`[auth] …`). Antes de cambiar la instancia hay que cambiar la ventana.
- **Clerk puede pedir una verificación contra bots al crear una cuenta.** La resuelve en su propio diálogo y la ventana espera. Si no termina, el error lo dice.
- **Qué se probó.** Contra una instancia de desarrollo de Clerk: correo con y sin cuenta, código incorrecto, reenvío, sesión abierta y regreso a la ruta pedida. Crear la cuenta hasta el final no se pudo automatizar: la verificación contra bots frena a un navegador automatizado, y esa instancia exigía contraseña. Hay que probarlo una vez a mano en producción con un correo nuevo.
- `UserProfile`, en Ajustes, sigue siendo el componente de Clerk.
- Los textos están en `auth.*` de los diccionarios. El número de dígitos sale de `CODE_LENGTH`.
- `/design-system` muestra la ventana con un servicio simulado y sus cinco estados, y las pruebas de navegador los capturan en claro y oscuro.

## Alternativas descartadas

- **Seguir con `<SignIn>` y `<SignUp>` de Clerk, ajustando su apariencia:** siguen siendo dos pantallas y dos flujos, y el estilo se acerca al del sitio pero no es el mismo.
- **El flujo combinado de Clerk (`<SignIn withSignUp>`):** resuelve el flujo, no el diseño.
- **Intentar entrar y, si el correo no existe, registrar** (el flujo «estándar» de la guía de Clerk): la pantalla siguiente revela quién tiene cuenta, y el registro empieza antes de verificar el correo.
- **Crear la cuenta al escribir el correo:** un correo mal escrito dejaría una cuenta vacía.
- **Que «Crear cuenta» navegue a `/sign-up`:** monta la ventana otra vez y borra lo escrito.
- **Saltarse el código en desarrollo:** el paso del código no se podría ver ni probar en local.
- **Un enlace mágico en vez de un código:** el enlace abre otra pestaña u otro dispositivo; el código se queda en la ventana donde se pidió.
