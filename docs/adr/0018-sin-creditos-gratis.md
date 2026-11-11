# ADR-0018: Sin créditos gratis al registrarse

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

Regalar créditos al registrarse sube la conversión, pero es el vector de abuso más común en las APIs de IA: se crean cuentas en masa para gastar los créditos gratis. Con precios ya muy bajos, cada crédito regalado se paga con nuestro costo real en el upstream, no con margen.

## Decisión

- **No hay créditos gratis al registrarse.**
- La recarga mínima es de $10 ([08 · Créditos y pagos](../08-creditos-y-pagos.md#recargas)).
- La conversión se apoya en el precio visible (oficial tachado frente al de cheaptokens.wtf) y en un onboarding de menos de 3 minutos.

## Consecuencias

- No hace falta verificación anti-abuso (teléfono, tarjeta) en el registro.
- La fricción para probar es más alta: el usuario tiene que pagar antes de su primer request.
- Las métricas de conversión miden intención real desde el día uno.

## Alternativas descartadas

- **$0.50–$1 de regalo con verificación por teléfono o tarjeta:** reduce el abuso pero no lo elimina, y suma un flujo de verificación. Se reconsidera si la conversión registro → recarga es baja.
- **Modelos gratis limitados (solo modelos baratos):** también nos cuestan y atraen tráfico que no convierte.
- **Códigos promocionales:** útiles para lanzamientos o alianzas. Se pueden agregar como `credit_transactions` de tipo `adjustment` sin un ADR nuevo.
