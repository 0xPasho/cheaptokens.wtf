#!/usr/bin/env bash
# Los dos crons que antes declaraba vercel.json (ADR-0055, ADR-0058), cada minuto desde el crontab:
#   * * * * * $HOME/cheapllm.wtf/deploy/cron.sh
# Llama a la app en local con el host de la web. Nunca imprime el secreto.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/.cron.log"
SECRET=$(grep -E '^CRON_SECRET=' "$DIR/.env.production.local" | cut -d= -f2-)
[ -n "$SECRET" ] || { echo "$(date -u +%FT%TZ) no CRON_SECRET" >> "$LOG"; exit 1; }

exec 9> "$DIR/.cron.lock"
flock -n 9 || exit 0

for path in /api/internal/refresh-catalog /api/internal/crypto-payments; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 55 -H "Host: cheapllm.wtf" -H "X-Forwarded-Proto: https" \
    -H "Authorization: Bearer $SECRET" "http://127.0.0.1:3014$path")
  [ "$code" = "200" ] || echo "$(date -u +%FT%TZ) $path $code" >> "$LOG"
done
# El log solo guarda fallos; se recorta para que no crezca sin límite.
[ -f "$LOG" ] && tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
