# ADR-0020: cheaptokens.wtf opera como intermediario, con entidad legal en México

- **Estado:** Aceptada (el texto legal final lo valida un abogado)
- **Fecha:** 2026-11-08
- **Origen:** Usuario

## Contexto

- Los prompts de los clientes pasan por los upstreams y por los creadores de los modelos ([ADR-0001](./0001-upstreams-agregadores.md)).
- El principio de producto es no revelar qué upstream atiende cada request. Las leyes de datos personales obligan a informar quién procesa los datos.
- La empresa está en México y los usuarios en todo el mundo.

## Decisión

- **Entidad legal en México.** Los términos, el aviso de privacidad y la contabilidad se rigen por la ley mexicana.
- **cheaptokens.wtf se declara intermediario:** da acceso, ruteo, catálogo y cobro por uso hacia modelos de terceros. No desarrolla, no entrena y no hospeda modelos, y no controla sus respuestas.
- **Los términos de servicio incluyen:**
  - El rol de intermediario y que el procesamiento lo hacen proveedores de inferencia de terceros.
  - Que no garantizamos el contenido de las respuestas de los modelos ni la disponibilidad de los proveedores, con la responsabilidad limitada según defina el abogado.
  - **Una política de uso aceptable que traslada las políticas de uso** de los creadores de los modelos y de los upstreams. Los upstreams lo exigen, y si un cliente las viola, la cuenta que pierde el upstream es la nuestra. Las violaciones se castigan suspendiendo el workspace (`suspended_at`).
  - Las reglas de los créditos: no transferibles, solo para el servicio, y las políticas de expiración y reembolso.
- **El aviso de privacidad** (LFPDPPP en México, más la información que exige el GDPR si hay usuarios en la UE):
  - Declara la categoría **"proveedores de inferencia de terceros"** sin nombrarlos, y que el procesamiento puede ocurrir fuera de México.
  - Dice que **no guardamos el contenido** de los requests ni de las respuestas ([ADR-0014](./0014-no-guardar-contenido.md)), solo metadatos de uso.
  - Nombra a los proveedores de infraestructura que no revelan nada del negocio: Clerk, Vercel, Neon, Upstash y el MoR.
- **Antes del lanzamiento, un abogado mexicano valida** los términos y el aviso de privacidad, incluida la parte de GDPR.

## Consecuencias

- Es coherente con el principio de no revelar el upstream.
- El mensaje para el cliente es claro: "tus prompts los procesan proveedores de terceros y nosotros no los guardamos".
- **Los clientes enterprise que pidan un DPA con la lista de subprocesadores** no se pueden atender en el MVP. En la fase 3 podría negociarse una lista bajo NDA.
- Trasladar la política de uso obliga a poder hacerla cumplir. Por eso existe la suspensión de workspaces.

## Alternativas descartadas

- **Nombrar a cada upstream en el aviso de privacidad:** contradice el principio de producto y obliga a actualizar el aviso cada vez que cambiamos de proveedor. Se reconsidera si el abogado lo exige.
- **No mencionar a los terceros:** incumple la obligación de transparencia y destruye la confianza si se descubre.
- **Presentarnos como proveedor de los modelos:** es falso y nos haría responsables de sus respuestas.
