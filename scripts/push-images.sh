#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${REGISTRY:-registry.test.local:5000}"

images=(
  "novamarket/gateway:1.1.2"
  "novamarket/frontend:1.2.0"
  "novamarket/shop:1.1.0"
  "novamarket/product:1.0.0"
  "novamarket/about:1.1.0"
  "novamarket/account:1.0.0"
  "novamarket/orders:1.0.0"
  "novamarket/checkout:1.0.0"
  "novamarket/admin:1.0.0"
  "novamarket/backend:1.0.1"
  "novamarket/catalog:1.2.0"
  "novamarket/cart:1.1.0"
  "novamarket/user:1.1.0"
  "novamarket/orders-api:1.1.0"
  "novamarket/payment:1.1.0"
  "novamarket/shipping:1.1.0"
  "novamarket/search:1.1.0"
  "novamarket/wishlist:1.1.0"
  "novamarket/reviews:1.1.0"
  "novamarket/notification:1.1.0"
  "novamarket/discount:1.1.0"
  "postgres:16.4-alpine"
)

for image in "${images[@]}"; do
  target="${REGISTRY}/${image/novamarket\//novamarket/}"
  if [[ "$image" == postgres:* ]]; then
    target="${REGISTRY}/library/$image"
  fi
  echo "==> $image -> $target"
  docker image inspect "$image" >/dev/null
  docker tag "$image" "$target"
  docker push "$target"
done

echo 'All images pushed.'
