#!/usr/bin/env bash
# Instalación en el servidor (ADR-0059). Idempotente: se puede correr otra vez tras cambiar nginx.conf o el
# archivo de pm2. Se corre en el servidor, desde ~/cheapllm.wtf, después de `deploy/deploy.sh`.
# Nunca escribe .env.production.local: ese archivo se sube a mano.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSL_DIR=/etc/nginx/ssl/cheapllm.wtf
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"

cd "$DIR"
test -f .env.production.local || { echo "Falta $DIR/.env.production.local"; exit 1; }
test -f .next/BUILD_ID || { echo "Falta el build en $DIR/.next: corre deploy/build.sh"; exit 1; }

echo "==> Certificado de origen"
if sudo test -f "$SSL_DIR/fullchain.pem"; then
  echo "    ya está en $SSL_DIR"
else
  sudo mkdir -p "$SSL_DIR"
  sudo openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout "$SSL_DIR/privkey.pem" -out "$SSL_DIR/fullchain.pem" \
    -subj "/CN=cheapllm.wtf" -addext "subjectAltName=DNS:cheapllm.wtf,DNS:api.cheapllm.wtf"
  sudo chmod 600 "$SSL_DIR/privkey.pem"
fi

echo "==> nginx"
sudo cp "$DIR/deploy/nginx.conf" /etc/nginx/sites-available/cheapllm.wtf
sudo ln -sfn /etc/nginx/sites-available/cheapllm.wtf /etc/nginx/sites-enabled/cheapllm.wtf
sudo nginx -t
sudo systemctl reload nginx

echo "==> pm2"
if pm2 describe cheapllm-web >/dev/null 2>&1; then
  pm2 restart cheapllm-web --update-env
else
  pm2 start "$DIR/deploy/ecosystem.config.cjs"
fi
pm2 save

echo "==> cron"
LINE="* * * * * $DIR/deploy/cron.sh"
( crontab -l 2>/dev/null | grep -vF "$DIR/deploy/cron.sh"; echo "$LINE" ) | crontab -

sleep 4
echo "==> Prueba"
for host in cheapllm.wtf api.cheapllm.wtf; do
  path=/en; [ "$host" = api.cheapllm.wtf ] && path=/v1/models
  printf '  %-34s %s\n' "$host$path" "$(curl -s -o /dev/null -w '%{http_code}' -m 20 -H "Host: $host" "http://127.0.0.1:3014$path")"
done
