#!/usr/bin/env bash
# Deploy desde la máquina del operador (ADR-0059, docs/18-deploy.md). Sube el commit HEAD (no el árbol de
# trabajo) a ~/cheapllm.wtf del servidor, compila allá y reinicia. El host, el usuario y la contraseña salen de
# ~/.deska-deploy.env: nunca van en el repo ni se imprimen.
#   deploy/deploy.sh             # código + build + reinicio
#   deploy/deploy.sh --env       # además sube .env.deploy como .env.production.local
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
set -a; . "$HOME/.deska-deploy.env"; set +a
export SSHPASS="$DESKA_DEPLOY_PASS"
TARGET="$DESKA_DEPLOY_USER@$DESKA_DEPLOY_HOST"
SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no)
REMOTE='$HOME/cheapllm.wtf'

[ -z "$(git status --porcelain)" ] || echo "Aviso: hay cambios sin commit; se sube HEAD ($(git rev-parse --short HEAD))."

"${SSH[@]}" "$TARGET" "mkdir -p $REMOTE"
# Reemplaza el código con el de HEAD sin tocar lo que no se versiona (env, node_modules, builds, logs).
git archive --format=tar HEAD | "${SSH[@]}" "$TARGET" "cd $REMOTE && tar -xf - && echo $(git rev-parse HEAD) > .deployed-commit"

if [ "${1:-}" = "--env" ]; then
  test -f .env.deploy || { echo "Falta .env.deploy"; exit 1; }
  "${SSH[@]}" "$TARGET" "umask 077; cat > $REMOTE/.env.production.local" < .env.deploy
fi

"${SSH[@]}" "$TARGET" "cd $REMOTE && chmod +x deploy/*.sh && deploy/build.sh && deploy/setup.sh"
