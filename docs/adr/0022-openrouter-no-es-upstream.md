# ADR-0022: OpenRouter no es upstream de producción; los términos del upstream deben permitir la reventa

- **Estado:** Reemplazada por [ADR-0024](./0024-openrouter-upstream-de-pruebas.md) el 2026-11-08: el usuario decidió usar OpenRouter en la fase de pruebas.
- **Fecha:** 2026-11-08
- **Origen:** Default, sobre la propuesta del usuario de usar OpenRouter como primer upstream

## Contexto

Se propuso OpenRouter como primer upstream. Técnicamente tiene la forma perfecta: una URL, compatible con OpenAI, IDs `autor/modelo`, reporte de `usage` y saldo prepagado. Pero, revisado el 2026-11-08:

1. **Sus términos lo prohíben** (última actualización: 31 de agosto de 2026):
   - Sección 7(4): no se puede acceder al servicio *"for purposes of reselling API access to Models or otherwise developing a competing service"*.
   - Sección 7(14): no se puede *"sell or otherwise transfer the access granted under these Terms"*.
2. **Su precio no deja margen:** según su FAQ, traslada el precio de los proveedores sin markup y cobra una comisión al comprar créditos (fuentes secundarias la ubican en ~5.5%). Nuestro costo sería **igual o mayor al precio oficial**, así que no se puede vender con descuento, y la validación de margen ([ADR-0010](./0010-precio-por-descuento.md)) lo bloquearía de todas formas.
3. **Sus créditos pueden expirar** a los 365 días de comprados (Sección 4.2).

## Decisión

- **OpenRouter no se usa como upstream en producción ni como fallback.**
- **Nuevo requisito obligatorio para todo upstream:** sus términos deben permitir revender el acceso o dárselo a nuestros clientes a través de nuestro producto. Si el texto es ambiguo, se pide confirmación por escrito, y la evidencia se guarda.
- OpenRouter queda como **referencia técnica:** nuestro formato de ID (`autor/modelo`) y la forma de API esperada son equivalentes a los suyos, así que un upstream que sí cumpla con esa forma se conecta sin cambios.
- **Para desarrollo y tests se usa un upstream simulado** (un servidor local compatible con OpenAI que devuelve streams y `usage` configurables). Así el gateway completo se construye sin contratar ningún upstream y sin gastar dinero.

## Consecuencias

- La lista de upstreams se arma desde cero con este filtro. **Hoy es el principal bloqueo para lanzar.**
- **La verdad incómoda:** un upstream que permite legalmente la reventa a 70–90% por debajo del precio oficial es raro, y quien lo ofrece probablemente obtiene su descuento de una fuente que puede caerse ([ADR-0001](./0001-upstreams-agregadores.md)). La lista de requisitos y la diversificación mitigan el riesgo, pero no lo eliminan.
- El upstream simulado desbloquea la fase 0 y la fase 1 sin depender de ningún contrato.

## Alternativas descartadas

- **Usar OpenRouter "mientras no se den cuenta":** sus términos le permiten suspender la cuenta, perderíamos el saldo prepagado, se cortaría el servicio a todos los clientes a la vez y, además, no hay margen.
- **OpenRouter solo como fallback, aunque sea con pérdida:** viola sus términos igual.
- **El acuerdo enterprise de OpenRouter:** permite poner el servicio a disposición de tus propios clientes finales, pero también restringe la reventa, y el precio seguiría siendo el oficial. No resuelve el descuento.
