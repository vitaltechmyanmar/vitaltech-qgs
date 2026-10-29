#!/usr/bin/env bash
# ============================================================================
# QGS Production Deployment Script
#
# Invoked by AWS Systems Manager Run Command:
#   /opt/vitaltech-qgs/deploy/deploy.sh <image-uri>:<git-sha>
#
# Required:
#   - EC2 IAM role can read the production secret from Secrets Manager
#   - EC2 IAM role can authenticate and pull images from ECR
#   - Docker and Docker Compose are installed
#   - docker-compose.prod.yml exists in /opt/vitaltech-qgs
#
# Secret:
#   vitaltech/qgs/production
#
# The migrator image is expected at <image-uri>:<git-sha>-migrate.
# ============================================================================

set -Eeuo pipefail
umask 077

APP_DIR="/opt/vitaltech-qgs"
SECRET_ID="vitaltech/qgs/production"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
ENV_FILE="${APP_DIR}/.env.production"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"

log() {
  echo "[deploy] $(date -u +%FT%TZ) $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

cd "$APP_DIR"

IMAGE="${1:?usage: deploy.sh <image-uri>:<git-sha>}"
MIGRATE_IMAGE="${IMAGE}-migrate"
PREVIOUS="$(cat .current-image 2>/dev/null || true)"

COMPOSE=(docker compose -f "$COMPOSE_FILE")

# ---------------------------------------------------------------------------
# Validate prerequisites
# ---------------------------------------------------------------------------

[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"

command -v aws >/dev/null 2>&1 || die "AWS CLI is not installed"
command -v docker >/dev/null 2>&1 || die "Docker is not installed"
command -v curl >/dev/null 2>&1 || die "curl is not installed"

docker compose version >/dev/null 2>&1 \
  || die "Docker Compose is unavailable"

log "target image: $IMAGE"

# ---------------------------------------------------------------------------
# Retrieve production environment from AWS Secrets Manager
# ---------------------------------------------------------------------------

log "retrieving production environment from Secrets Manager"

TEMP_FILE="$(mktemp "${APP_DIR}/.env.production.tmp.XXXXXX")"

cleanup() {
  if [[ -n "${TEMP_FILE:-}" && -f "$TEMP_FILE" ]]; then
    rm -f "$TEMP_FILE"
  fi
}

trap cleanup EXIT

if ! aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$AWS_REGION" \
  --query 'SecretString' \
  --output text > "$TEMP_FILE"; then
  die "Failed to retrieve production secret: $SECRET_ID"
fi

[[ -s "$TEMP_FILE" ]] \
  || die "Retrieved production environment is empty"

chmod 600 "$TEMP_FILE"
mv -f "$TEMP_FILE" "$ENV_FILE"
TEMP_FILE=""

chmod 600 "$ENV_FILE"

log "production environment file updated"

# ---------------------------------------------------------------------------
# Authenticate with Amazon ECR
# ---------------------------------------------------------------------------

log "authenticating with Amazon ECR"

ECR_REGISTRY="${IMAGE%%/*}"

aws ecr get-login-password \
  --region "$AWS_REGION" \
  | docker login \
      --username AWS \
      --password-stdin "$ECR_REGISTRY" \
  || die "ECR authentication failed"

# ---------------------------------------------------------------------------
# Set image variables for Docker Compose
# ---------------------------------------------------------------------------

export QGS_IMAGE="$IMAGE"
export QGS_MIGRATE_IMAGE="$MIGRATE_IMAGE"

# ---------------------------------------------------------------------------
# Pull application and migration images
# ---------------------------------------------------------------------------

log "pulling images"

"${COMPOSE[@]}" pull app migrate \
  || die "Failed to pull application or migration image"

# ---------------------------------------------------------------------------
# Run database migrations
# ---------------------------------------------------------------------------

log "applying migrations"

"${COMPOSE[@]}" run --rm --no-deps migrate \
  || die "Database migration failed"

# ---------------------------------------------------------------------------
# Start application and Nginx
# ---------------------------------------------------------------------------

log "starting app and nginx"

"${COMPOSE[@]}" up -d --no-deps app nginx \
  || die "Failed to start application services"

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

log "waiting for application health"

HEALTHY=false

for _ in $(seq 1 20); do
  if curl -fsS --max-time 3 \
    http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi

  sleep 3
done

if [[ "$HEALTHY" == "true" ]]; then
  log "application health check passed"

  "${COMPOSE[@]}" exec -T nginx nginx -t \
    || die "Nginx configuration test failed"

  "${COMPOSE[@]}" exec -T nginx nginx -s reload \
    || die "Nginx reload failed"

  printf '%s\n' "$IMAGE" > .current-image

  docker image prune -f >/dev/null 2>&1 || true

  log "deployment successful: $IMAGE"
  exit 0
fi

# ---------------------------------------------------------------------------
# Failure diagnostics
# ---------------------------------------------------------------------------

log "health check failed"

"${COMPOSE[@]}" ps || true

log "application logs (last 100 lines)"
"${COMPOSE[@]}" logs --tail=100 app || true

log "nginx logs (last 100 lines)"
"${COMPOSE[@]}" logs --tail=100 nginx || true

# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------

if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$IMAGE" ]]; then
  log "attempting rollback to $PREVIOUS"

  # Avoid an infinite rollback loop if the previous image also fails.
  export QGS_IMAGE="$PREVIOUS"
  export QGS_MIGRATE_IMAGE="${PREVIOUS}-migrate"

  if "${COMPOSE[@]}" up -d --no-deps app nginx; then
    for _ in $(seq 1 20); do
      if curl -fsS --max-time 3 \
        http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
        log "rollback health check passed"
        exit 1
      fi
      sleep 3
    done
  fi

  log "WARNING: rollback did not pass the health check"
fi

exit 1

