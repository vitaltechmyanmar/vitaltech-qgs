#!/usr/bin/env bash
# ============================================================================
# Deploy a QGS image on the EC2 host. Invoked by SSM Run Command:
#   /opt/vitaltech/deploy.sh <image-uri>:<git-sha>
# The migrator image is expected at <image-uri>:<git-sha>-migrate.
# ============================================================================
set -euo pipefail

cd /opt/vitaltech-qgs

IMAGE="${1:?usage: deploy.sh <image-uri>:<sha>}"
MIGRATE_IMAGE="${IMAGE}-migrate"
PREVIOUS="$(cat .current-image 2>/dev/null || true)"
COMPOSE=(docker compose -f docker-compose.prod.yml)

log() { echo "[deploy] $(date -u +%FT%TZ) $*"; }

log "target image: $IMAGE"

aws ecr get-login-password --region "${AWS_REGION:-ap-southeast-1}" \
  | docker login --username AWS --password-stdin "${IMAGE%%/*}"

export QGS_IMAGE="$IMAGE"
export QGS_MIGRATE_IMAGE="$MIGRATE_IMAGE"

log "pulling images"
"${COMPOSE[@]}" pull app migrate

log "applying migrations"
"${COMPOSE[@]}" run --rm --no-deps migrate

log "starting app"
"${COMPOSE[@]}" up -d --no-deps app nginx

log "waiting for health"
for _ in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    # Re-resolve the `app` upstream and pick up nginx.conf changes.
    "${COMPOSE[@]}" exec -T nginx nginx -t
    "${COMPOSE[@]}" exec -T nginx nginx -s reload
    echo "$IMAGE" > .current-image
    docker image prune -f >/dev/null
    log "deployed $IMAGE"
    exit 0
  fi
  sleep 3
done

log "health check failed"
"${COMPOSE[@]}" logs --tail=100 app || true

if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$IMAGE" ]]; then
  log "rolling back to $PREVIOUS"
  exec "$0" "$PREVIOUS"
fi

exit 1
