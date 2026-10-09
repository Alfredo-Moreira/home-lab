#!/usr/bin/env bash
set -euo pipefail

REGISTRY="192.168.4.79:5000"
IMAGE_NAME="homelab"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(tr -d '[:space:]' < "${SCRIPT_DIR}/../VERSION")"
TAG="${1:-${VERSION}}"
FULL_TAG="${REGISTRY}/${IMAGE_NAME}:${TAG}"
LATEST_TAG="${REGISTRY}/${IMAGE_NAME}:latest"

echo "==> Setting up multi-platform builder"
docker buildx inspect multiplatform-builder &>/dev/null \
  && docker buildx rm multiplatform-builder
docker buildx create \
  --name multiplatform-builder \
  --config "${SCRIPT_DIR}/buildkitd.toml" \
  --use

echo "==> Building image: ${FULL_TAG}"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t "${FULL_TAG}" \
  -t "${LATEST_TAG}" \
  "${SCRIPT_DIR}/.."

echo "==> Updating docker-compose.nas.yml image tag to ${TAG}"
sed -i '' \
  "s|${REGISTRY}/${IMAGE_NAME}:[^ ]*|${FULL_TAG}|" \
  "${SCRIPT_DIR}/../docker-compose.nas.yml"

echo "==> Done. Image available at ${FULL_TAG}"
