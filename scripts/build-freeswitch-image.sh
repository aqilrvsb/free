#!/usr/bin/env bash
set -euo pipefail

# Simple helper to build and push the FreeSWITCH image for multiple architectures.
# You can pre-export env vars or let the script prompt for missing ones.
# Required:
#   FS_TOKEN                SignalWire repo token used during the build step.
#   FREESWITCH_IMAGE        Target image name, e.g. docker.io/myuser/freeswitch.
# Optional (with defaults shown when prompted):
#   FREESWITCH_TAG          Tag to apply (default: latest).
#   FREESWITCH_PLATFORMS    Comma-separated platform list (default: linux/amd64,linux/arm64).
#   FREESWITCH_BUILDER      Buildx builder name (default: fs-multiarch).
#   PUSH                    Set to "false" to build without --push (uses --load for local testing).

prompt_required() {
  local var_name="$1"
  local prompt="$2"
  local value

  value="${!var_name:-}"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return
  fi

  while [[ -z "${value:-}" ]]; do
    read -r -p "$prompt" value
    value="${value## }"; value="${value%% }"
  done
  printf '%s' "$value"
}

prompt_optional() {
  local var_name="$1"
  local prompt="$2"
  local default="$3"
  local value

  value="${!var_name:-}"
  if [[ -z "$value" ]]; then
    read -r -p "$prompt" value
    value="${value## }"; value="${value%% }"
    value=${value:-$default}
  fi
  printf '%s' "$value"
}

FS_TOKEN=$(prompt_required FS_TOKEN "Enter FS_TOKEN (SignalWire token): ")
FREESWITCH_IMAGE=$(prompt_required FREESWITCH_IMAGE "Enter target image (e.g. docker.io/username/freeswitch): ")
FREESWITCH_TAG=$(prompt_optional FREESWITCH_TAG "Enter image tag [latest]: " "latest")
FREESWITCH_PLATFORMS=$(prompt_optional FREESWITCH_PLATFORMS "Enter platform list [linux/amd64,linux/arm64]: " "linux/amd64,linux/arm64")
FREESWITCH_BUILDER=$(prompt_optional FREESWITCH_BUILDER "Enter buildx builder name [fs-multiarch]: " "fs-multiarch")
PUSH=$(prompt_optional PUSH "Push after build? [true]: " "true")
PUSH=$(printf '%s' "$PUSH" | tr '[:upper:]' '[:lower:]')

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found" >&2
  exit 1
fi

# Ensure the buildx builder exists and is active for multi-arch builds.
if ! docker buildx inspect "$FREESWITCH_BUILDER" >/dev/null 2>&1; then
  docker buildx create --name "$FREESWITCH_BUILDER" --use
else
  docker buildx use "$FREESWITCH_BUILDER"
fi

declare -a build_cmd=(
  docker buildx build
  --platform "$FREESWITCH_PLATFORMS"
  --build-arg FS_TOKEN="$FS_TOKEN"
  -f docker/freeswitch.Dockerfile
  -t "$FREESWITCH_IMAGE:$FREESWITCH_TAG"
  --progress=plain
  .
)

if [[ "$PUSH" == "false" ]]; then
  build_cmd+=(--load)
else
  build_cmd+=(--push)
fi

echo "Building FreeSWITCH image $FREESWITCH_IMAGE:$FREESWITCH_TAG for platforms: $FREESWITCH_PLATFORMS"
"${build_cmd[@]}"
