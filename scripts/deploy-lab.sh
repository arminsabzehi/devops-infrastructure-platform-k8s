#!/usr/bin/env bash
set -euo pipefail

NAMESPACE=digino
OVERLAY=k8s/overlays/lab

echo '==> Validating manifests'
kubectl kustomize "$OVERLAY" >/dev/null

echo '==> Applying manifests'
kubectl apply -k "$OVERLAY"

echo
echo '==> Workloads'
kubectl -n "$NAMESPACE" get pods -o wide

echo
echo '==> Services'
kubectl -n "$NAMESPACE" get svc

echo
echo '==> Ingress'
kubectl -n "$NAMESPACE" get ingress
