
#!/usr/bin/env bash
# ============================================================================
# QGS Production Deployment Script
#
# Invoked by AWS Systems Manager Run Command:
#   deploy.sh <image-uri>:<git-sha>
#
# Security:
#   - Retrieves the production environment from AWS Secrets Manager.
#   - Uses a temporary Docker configuration.
#   - Uses the ECR credential helper when installed.
#   - Removes temporary files and credentials on exit.
#   - Preserves health checks and rollback behavior.
# ============================================================================

set -Eeuo pipefail
umask 077

APP_DIR="/opt/vitaltech-qgs"
SECRET_ID="vitaltech/qgs/production"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
ENV_FILE="${APP_DIR}/.env.production"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"

TEMP_FILE=""
DOCKER_CONFIG_DIR=""
ECR_REGISTRY=""

log() {
  echo "[deploy] $(date -u +%FT%TZ) $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

cleanup() {
  local rc=$?

  # Remove the temporary Docker configuration and credentials.
  if [[ -n "${DOCKER_CONFIG_DIR:-}" &&
        -d "$DOCKER_CONFIG_DIR" ]]; then
    if [[ -n "${ECR_REGISTRY:-}" ]]; then
      docker logout "$ECR_REGISTRY" >/dev/null 2>&1 || true
    fi

    rm -rf -- "$DOCKER_CONFIG_DIR"
  fi

  # Remove any unfinished Secrets Manager download.
  if [[ -n "${TEMP_FILE:-}" && -f "$TEMP_FILE" ]]; then
    rm -f -- "$TEMP_FILE"
  fi

  return "$rc"
}

trap cleanup EXIT

cd "$APP_DIR"

IMAGE="${1:?usage: deploy.sh <image-uri>:<git-sha>}"
MIGRATE_IMAGE="${IMAGE}-migrate"
PREVIOUS="$(cat .current-image 2>/dev/null || true)"

COMPOSE=(docker compose -f "$COMPOSE_FILE")

# ---------------------------------------------------------------------------
# Validate prerequisites and image reference
# ---------------------------------------------------------------------------

[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found"
command -v aws >/dev/null 2>&1 || die "AWS CLI is not installed"
command -v docker >/dev/null 2>&1 || die "Docker is not installed"
command -v curl >/dev/null 2>&1 || die "curl is not installed"
command -v mktemp >/dev/null 2>&1 || die "mktemp is not installed"

docker compose version >/dev/null 2>&1 ||
  die "Docker Compose is unavailable"

# Accept an ECR image URI with a tag; reject malformed input.
if [[ ! "$IMAGE" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-zA-Z0-9._/-]+:[a-zA-Z0-9._-]+$ ]]; then
  die "Invalid ECR image URI"
fi

ECR_REGISTRY="${IMAGE%%/*}"

EXPECTED_REGISTRY_SUFFIX=".dkr.ecr.${AWS_REGION}.amazonaws.com"
[[ "$ECR_REGISTRY" == *"$EXPECTED_REGISTRY_SUFFIX" ]] ||
  die "Image registry does not match AWS region ${AWS_REGION}"

log "target image: $IMAGE"

# ---------------------------------------------------------------------------
# Retrieve production environment from Secrets Manager
# ---------------------------------------------------------------------------

log "retrieving production environment from Secrets Manager"

TEMP_FILE="$(mktemp "${APP_DIR}/.env.production.tmp.XXXXXX")"
chmod 600 "$TEMP_FILE"

if ! aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$AWS_REGION" \
  --query 'SecretString' \
  --output text > "$TEMP_FILE"; then
  die "Failed to retrieve production secret"
fi

[[ -s "$TEMP_FILE" ]] || die "Retrieved production environment is empty"

# Atomic replacement prevents partially written environment files.
mv -f -- "$TEMP_FILE" "$ENV_FILE"
TEMP_FILE=""
chmod 600 "$ENV_FILE"

log "production environment file updated"

# ---------------------------------------------------------------------------
# Set image variables for Docker Compose
# ---------------------------------------------------------------------------

export QGS_IMAGE="$IMAGE"
export QGS_MIGRATE_IMAGE="$MIGRATE_IMAGE"

# ---------------------------------------------------------------------------
# Authenticate with ECR using a temporary Docker configuration
# ---------------------------------------------------------------------------

log "configuring temporary Docker credentials"

DOCKER_CONFIG_DIR="$(mktemp -d /tmp/qgs-docker-config.XXXXXX)"
chmod 700 "$DOCKER_CONFIG_DIR"
export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"

if command -v docker-credential-ecr-login >/dev/null 2>&1; then
  # Preferred: the helper obtains ECR credentials using the EC2 IAM role.
  # Credentials are not saved as a Docker login password in config.json.
  printf '{"credHelpers":{"%s":"ecr-login"}}\n' "$ECR_REGISTRY" \
    > "$DOCKER_CONFIG/config.json"
  chmod 600 "$DOCKER_CONFIG/config.json"

  log "using Amazon ECR credential helper"
else
  # Fallback: credentials are stored in the temporary Docker config
  # for the duration of this deployment only.
  log "ECR credential helper unavailable; using temporary Docker login"

  aws ecr get-login-password --region "$AWS_REGION" |
    docker login \
      --username AWS \
      --password-stdin "$ECR_REGISTRY" ||
      die "ECR authentication failed"
fi

# ---------------------------------------------------------------------------
# Pull application and migration images
# ---------------------------------------------------------------------------

log "pulling images"

"${COMPOSE[@]}" pull app migrate ||
  die "Failed to pull application or migration image"

# ---------------------------------------------------------------------------
# Run database migrations
# ---------------------------------------------------------------------------

log "applying migrations"

"${COMPOSE[@]}" run --rm --no-deps migrate ||
  die "Database migration failed"

# ---------------------------------------------------------------------------
# Start application and Nginx
# ---------------------------------------------------------------------------

log "starting app and nginx"

"${COMPOSE[@]}" up -d --no-deps app nginx ||
  die "Failed to start application services"

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

  "${COMPOSE[@]}" exec -T nginx nginx -t ||
    die "Nginx configuration test failed"

  "${COMPOSE[@]}" exec -T nginx nginx -s reload ||
    die "Nginx reload failed"

  # Atomically record the deployed image.
  printf '%s\n' "$IMAGE" > .current-image.tmp
  chmod 600 .current-image.tmp
  mv -f .current-image.tmp .current-image

  # Remove only dangling images; do not remove volumes or active containers.
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
  log "attempting rollback to previous image"

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
