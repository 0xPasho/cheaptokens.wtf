# 18 · Deploy

Cómo se publica cheapllm.wtf en el servidor propio ([ADR-0059](./adr/0059-servidor-propio-con-pm2-y-nginx.md)). Nada se publica solo: cada deploy es manual.

## Qué hay en el servidor

| Pieza | Dónde |
| --- | --- |
| Código, build y variables | `~/cheapllm.wtf` (`.env.production.local` no se versiona) |
| Proceso | pm2 `cheapllm-web`, `next start` en `127.0.0.1:3014` |
| nginx | `/etc/nginx/sites-available/cheapllm.wtf`, copia de `deploy/nginx.conf` |
| Certificado de origen | `/etc/nginx/ssl/cheapllm.wtf` (autofirmado; Cloudflare en modo Full) |
| Cron | `deploy/cron.sh` cada minuto, en el crontab del usuario |
| Base de datos | `cheapllm` con el rol `cheapllm_app`, en el Postgres compartido |

El host, el usuario y la contraseña del servidor están en `~/.deska-deploy.env` de la máquina del operador. No van en el repo ni en ningún documento.

## Publicar

```bash
pnpm check              # antes de publicar
git push                # el deploy sube HEAD, no el árbol de trabajo
deploy/deploy.sh        # código + dependencias + migraciones + catálogo + build + reinicio
```

`deploy/deploy.sh --env` sube además `.env.deploy` (local, sin versionar) como `.env.production.local`. Úsalo cuando cambie una variable. Las `NEXT_PUBLIC_*` se fijan al compilar: un cambio en ellas necesita un build nuevo.

El script corre en el servidor `deploy/build.sh` y después `deploy/setup.sh`:

- **`build.sh`:** `pnpm install`, `pnpm db:migrate`, `pnpm catalog:sync` y `next build` en `.next-build`, con swap temporal. Solo si el build termina, cambia `.next` por el nuevo y deja el anterior en `.next-prev`.
- **`setup.sh`:** certificado, vhost de nginx, pm2 y la línea del crontab. Es idempotente.

## Comprobar

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://cheapllm.wtf/en          # 200
curl -s -o /dev/null -w '%{http_code}\n' https://api.cheapllm.wtf/v1/models   # 200
```

En el servidor: `pm2 logs cheapllm-web` y `~/cheapllm.wtf/.cron.log` (solo guarda los fallos del cron).

## Volver atrás

En el servidor: `cd ~/cheapllm.wtf && mv .next .next-bad && mv .next-prev .next && pm2 restart cheapllm-web`. Las migraciones no se deshacen solas.

## Trampas

- **`tar` no borra:** un archivo eliminado del repo sigue en el servidor hasta que se borre a mano. No afecta al build salvo que sea una ruta de `src/app`.
- **Sin `APP_ENV=production`** la app entra en modo de desarrollo: login sin verificación y pagos de prueba ([ADR-0050](./adr/0050-login-clerk-y-modo-desarrollo.md)).
- **Cloudflare corta a los 100 s sin bytes.** Afecta a requests sin stream muy largos.
- **`next start` sin `--hostname`:** con `--hostname 127.0.0.1`, Next arma las URLs como `https://localhost:3014`, el proxy de Clerk intenta reenviar ahí por TLS y todas las páginas responden 500 (`Failed to proxy … EPROTO`, visto el 2026-11-17). El firewall del servidor ya cierra el puerto 3014 hacia afuera.
