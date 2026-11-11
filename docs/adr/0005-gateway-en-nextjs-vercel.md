# ADR-0005: Gateway dentro de Next.js en Vercel, aislado para poder extraerlo

- **Estado:** Aceptada. [ADR-0033](./0033-gateway-con-dependencias-inyectadas.md) concreta el aislamiento con una función de dependencias inyectadas.
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

El gateway mantiene streams abiertos durante minutos (los modelos de razonamiento tardan) y es el hot path de todo el producto. El dashboard es una app web normal. Correr las dos cosas juntas simplifica el deploy. Separarlas da más control sobre la duración y el costo de los streams.

## Decisión

- **Una sola app de Next.js 16 en Vercel con Fluid compute.** El gateway son Route Handlers en `src/app/v1/`, con runtime Node.js (el Edge Runtime está deprecado en Next 16).
- `/v1/chat/completions` exporta `maxDuration = 800`, el máximo de Vercel **Pro**.
- **Producción en Vercel Pro.** Hobby limita las funciones a 300 s y es solo para uso personal no comercial.
- Las funciones van en la misma región que la base de datos.
- **Aislamiento:** toda la lógica del gateway vive en `src/lib/gateway/` y no importa nada de Clerk, React ni i18n. El route handler solo adapta el `Request` y el `Response`.

## Consecuencias

- Un solo repo, un deploy y un pipeline. El tipado se comparte entre el dashboard y el gateway.
- **Límites que vigilar:** 800 s de duración máxima y 4.5 MB por body de request (las imágenes grandes en base64 fallan con `413`).
- El costo de Fluid compute crece con la duración de los streams. Hay que medir el costo de cómputo por request frente al margen.
- **Disparadores para mover el gateway a Cloudflare Workers:** requests legítimos de más de 800 s, el límite de 4.5 MB bloqueando a usuarios reales, o un costo de cómputo relevante frente al margen. Gracias al aislamiento, la migración es mover `src/lib/gateway/` y reescribir el adaptador.

## Alternativas descartadas

- **Gateway separado en Cloudflare Workers desde el día uno:** no tiene límite de tiempo mientras el cliente siga conectado y cobra por CPU, pero significa dos servicios, dos deploys y código compartido entre runtimes, antes de tener un solo usuario.
- **Todo en Cloudflare (Next con OpenNext):** suma una capa de adaptación sobre Next 16 y Cache Components, y la estabilidad está menos probada.
- **Un servidor propio (Fly, Railway, VPS):** sin límites de duración, pero hay que operarlo y escalarlo a mano.
