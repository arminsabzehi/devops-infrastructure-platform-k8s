# Base manifests

This layer describes the application independently of the lab registry hostname.

Key Kubernetes mapping:

- Docker Compose service -> Deployment + Service
- Docker Compose environment -> container `env`
- Docker volume -> PVC
- Nginx bind-mounted config -> ConfigMap
- Host port 8083 -> Ingress
- Compose service DNS (`catalog`, `db`, `payment`, ...) -> Kubernetes Service DNS with the same names

The application is intentionally kept close to the Docker Compose architecture so the migration is easy to understand and troubleshoot.
