# ADR-0034: El gateway se construye por olas, con planificador, ejecutores y revisores

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Origen:** Usuario (orquestación con planificador, ejecutores y revisión) + Default (olas, propiedad de archivos y reglas)

## Contexto

- El dueño quiere construir el gateway con orquestación: un planificador, ejecutores y revisión.
- El gateway tiene piezas independientes (keys, SSE, medición, base de datos, mock) y piezas que las juntan (fallback, cobro, route handler). Si varios agentes las hacen a la vez sin un contrato común, chocan en los mismos tipos y archivos.
- Un revisor que lee el razonamiento del ejecutor tiende a darle la razón. Uno que solo ve el diff y la especificación revisa de verdad.
- El proyecto todavía no es un repositorio git.

## Decisión

- **El plan es [15 · Plan: gateway con InferHub](../15-plan-gateway.md):** 16 paquetes en 5 olas.
- **Roles:**
  - El **planificador** abre una tarea por paquete, lanza cada ola y escribe los ADRs cuando una decisión cambia. No escribe código.
  - El **ejecutor** implementa un solo paquete en su worktree.
  - El **revisor** recibe el diff y la especificación, no el razonamiento del ejecutor, y devuelve "aprobado" o una lista de cambios.
  - El **integrador** hace merge en orden y corre `pnpm check` en `main`.
- **Contratos primero:** la ola 0 la hace un solo ejecutor y fija los tipos y firmas ([ADR-0033](./0033-gateway-con-dependencias-inyectadas.md)).
- **Un archivo pertenece a un solo paquete por ola.**
- **Una ola empieza cuando la anterior está integrada** y `pnpm check` pasa.
- **Máximo 2 rondas de revisión por paquete;** después decide el planificador.
- **Si una decisión de los docs no funciona,** el ejecutor para y lo reporta. El código nunca diverge en silencio de los docs.
- **Next 16:** quien toque `src/app/` cita la guía de `node_modules/next/dist/docs/` que usó.
- **Pruebas en vivo contra InferHub** solo con `INFERHUB_LIVE=1` y un tope de $1 para todo el plan.
- **Requisito previo: el proyecto es un repositorio git** con un commit inicial.

## Consecuencias

- Las olas 1, 2 y 4 corren en paralelo sin conflictos de merge.
- **Son unas 32 corridas de agente** (16 ejecuciones y sus revisiones). La ola 0 es secuencial y retrasa el arranque, a cambio de que las siguientes no choquen.
- Cada decisión que aparezca al construir queda en un ADR, no en un comentario de un PR.
- Hasta que se haga `git init`, no se puede lanzar ningún ejecutor.

## Alternativas descartadas

- **Un solo agente, en secuencia:** su contexto crece con cada paquete y no aprovecha que la mitad del trabajo es independiente.
- **Todo en paralelo desde el inicio, sin contratos:** cada ejecutor inventaría sus propios tipos para lo mismo.
- **Que el ejecutor se revise solo:** revisa su propio razonamiento, no el código.
