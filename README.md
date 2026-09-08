# دیجی‌نو — Kubernetes Deployment

Kubernetes deployment manifests for the `devops-infrastructure-platform` ecommerce lab.

## Architecture

```text
Client
  |
  v
Ingress (ingress-nginx)
  |
  v
Gateway Service :80
  |
  +--> frontend / shop / product / about / account / orders / checkout / admin
  +--> catalog / user / cart / order-service / payment / shipping
  +--> search / wishlist / reviews / notification / discount / backend
  |
  v
PostgreSQL 16
```

The application keeps the existing Nginx gateway. Kubernetes Ingress is only the external entry point; internal application routing remains in the gateway.

## Offline deployment

Images are expected in the private registry:

`registry.test.local:5000`

The Kustomize overlay rewrites `novamarket/*` images to the private registry.

## First deployment

```bash
kubectl apply -k k8s/overlays/lab
kubectl -n digino get pods -o wide
kubectl -n digino get svc
kubectl -n digino get ingress
```

Before deploying, make sure every required image has been built and pushed to the private registry and that the Kubernetes nodes can pull from the registry.

## Storage

PostgreSQL uses a PVC. The storage class is configurable in `k8s/overlays/lab/kustomization.yaml`; it is intentionally not hard-coded because the cluster storage implementation may differ between labs.

## Important

This repository contains Kubernetes deployment configuration. The application source and Docker Compose environment remain in the original repository:
`arminsabzehi/devops-infrastructure-platform`.
