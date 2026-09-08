# Lab overlay

The lab overlay is designed for the offline Kubernetes environment.

## Registry

Images are rewritten to:

`registry.test.local:5000/novamarket/...`

PostgreSQL is rewritten to:

`registry.test.local:5000/library/postgres:16.4-alpine`

The registry must contain these tags before the workloads can start.

## Ingress

The public application hostname is `digino.local`.

For a lab without internal DNS, point `digino.local` to the external IP of the ingress-nginx controller (for example the MetalLB address assigned to the ingress service).

## Storage

PostgreSQL requests a 5Gi PVC. The PVC intentionally uses the cluster default StorageClass so this overlay does not assume a particular storage backend.
