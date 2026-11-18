#!/usr/bin/env bash
# Build en el servidor (ADR-0059). Instala dependencias, migra la base, sincroniza el catálogo y compila en un
# directorio aparte: el build vivo no se toca hasta que el nuevo terminó (.next-prev queda para volver atrás).
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"

cd "$DIR"
test -f .env.production.local || { echo "Falta $DIR/.env.production.local"; exit 1; }
# Los scripts de scripts/ corren fuera de Next: leen las variables del shell.
set -a; . ./.env.production.local; set +a

pnpm install --frozen-lockfile
pnpm db:migrate
pnpm catalog:sync || echo "catalog:sync falló o no revalidó (normal antes del primer arranque)"

# El servidor comparte memoria con otras apps: next build necesita swap.
SWAP=/swapfile-cheapllm-build
if ! sudo swapon --show | grep -q "$SWAP"; then
  sudo fallocate -l 3G "$SWAP" && sudo chmod 600 "$SWAP" && sudo mkswap "$SWAP" >/dev/null && sudo swapon "$SWAP"
fi
trap 'sudo swapoff "$SWAP" 2>/dev/null; sudo rm -f "$SWAP"' EXIT

rm -rf .next-build
NEXT_DIST_DIR=.next-build NODE_OPTIONS=--max-old-space-size=3072 pnpm build
test -f .next-build/BUILD_ID
rm -rf .next-prev
[ -d .next ] && mv .next .next-prev
mv .next-build .next
echo "Build listo: $(cat .next/BUILD_ID)"
