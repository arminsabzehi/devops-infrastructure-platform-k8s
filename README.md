# NovaMarket — Kubernetes Deployment

> Kubernetes manifests for the NovaMarket ecommerce lab, maintained separately from the application source repository.

## فارسی

### معرفی

این Repository شامل manifestها و تنظیمات استقرار **NovaMarket** روی Kubernetes است.

Repository اصلی کد برنامه:
`arminsabzehi/devops-infrastructure-platform`

این Repository صرفاً قابلیت‌هایی را مستند می‌کند که در لابراتوار فعلی پیاده‌سازی و تست شده‌اند.

### وضعیت فعلی

- Kubernetes `v1.34.2`
- Namespace: `digino`
- یک PostgreSQL StatefulSet با PVC
- Migration Job برای schema و seed اولیه
- Nginx Gateway به‌عنوان نقطه ورود داخلی برنامه
- Gateway با `Service type: LoadBalancer` و MetalLB
- سرویس‌های برنامه به Deploymentهای مستقل تفکیک شده‌اند
- Catalog به MinIO متصل است
- تصاویر محصولات در MinIO نگهداری می‌شوند
- Catalog برای Objectهای MinIO، Presigned GET URL تولید می‌کند
- Private container registry برای محیط محدود/آفلاین
- مدیریت deployment با Kustomize

### معماری

```text
                         Client / Browser
                                |
                                v
                     MetalLB LoadBalancer
                         172.16.8.183:80
                                |
                                v
                         Nginx Gateway
                                |
          +---------------------+---------------------+
          |                     |                     |
          v                     v                     v
     Frontend/UI          Application APIs        Catalog API
                                                      |
                                      +---------------+---------------+
                                      |                               |
                                      v                               v
                                PostgreSQL 16                    MinIO
                                                                  |
                                                                  v
                                                        Product Images / Files
```

Gateway مسئول routing داخلی سرویس‌هاست. در وضعیت فعلی، برای ورود خارجی از Kubernetes Ingress استفاده نشده و Gateway با LoadBalancer/MetalLB در دسترس است.

### سرویس‌های Kubernetes

Manifestهای فعلی سرویس‌ها به‌صورت Deploymentهای مستقل نگهداری می‌شوند، از جمله:

```text
frontend
shop
product
about
account
orders
checkout
admin
backend
catalog
user
cart
order-service
payment
shipping
search
wishlist
reviews
notification
discount
```

همچنین منابع زیر در deployment پایه وجود دارند:

```text
namespace
postgres
 db-migrate
gateway
```

### Storage

PostgreSQL از PersistentVolumeClaim استفاده می‌کند. StorageClass در تنظیمات محیط lab قابل تنظیم است و به یک پیاده‌سازی خاص hard-code نشده است.

تصاویر و فایل‌های محصول در PostgreSQL ذخیره نمی‌شوند. Catalog فقط Object Key را در DB نگه می‌دارد، برای مثال:

```text
products/25/main.jpg
```

و فایل واقعی در MinIO قرار دارد:

```text
novamarket/products/25/main.jpg
```

Catalog سپس یک Presigned URL موقت تولید می‌کند.

### تعویض تصویر محصول

یکی از تغییرات مهم معماری این پروژه، جدا کردن فایل‌های محصول از lifecycle برنامه است.

برای تغییر تصویر محصول، فایل جدید می‌تواند در MinIO جایگزین شود و Object Key محصول حفظ شود. این کار نیازمند:

- database migration جدید نیست
- Docker image جدید نیست
- Kubernetes redeploy نیست

Migrationهای PostgreSQL برای schema و تغییرات کنترل‌شده داده استفاده می‌شوند، نه برای تعویض معمول تصاویر.

### Private Registry / Offline Lab

در لابراتوار فعلی، imageها از یک registry خصوصی دریافت می‌شوند. Kubernetes باید به registry دسترسی داشته باشد.

نمونه registry مورد استفاده در محیط lab:

```text
reg.test.local
```

> آدرس و نحوه دسترسی registry وابسته به محیط lab است و credentialها در Repository نگهداری نمی‌شوند.

### Kustomize

ساختار deployment به شکل زیر است:

```text
k8s/
├── base/
│   ├── namespace.yaml
│   ├── postgres.yaml
│   ├── db-migrate.yaml
│   ├── gateway.yaml
│   ├── frontend/
│   ├── shop/
│   ├── product/
│   ├── about/
│   ├── account/
│   ├── orders/
│   ├── checkout/
│   ├── admin/
│   ├── backend/
│   ├── catalog/
│   ├── user/
│   ├── cart/
│   ├── order-service/
│   ├── payment/
│   ├── shipping/
│   ├── search/
│   ├── wishlist/
│   ├── reviews/
│   ├── notification/
│   └── discount/
└── overlays/
    └── lab/
        └── kustomization.yaml
```

### Deployment

برای اعمال overlay محیط lab:

```bash
kubectl apply -k k8s/overlays/lab
```

بررسی وضعیت:

```bash
kubectl -n digino get pods -o wide
kubectl -n digino get svc
```

### وضعیت پروژه

این Repository یک لابراتوار عملی برای یادگیری و پیاده‌سازی Kubernetes و DevOps است. هدف آن نمایش یک deployment قابل اجرا و قابل بررسی است، نه ادعای یک پلتفرم production-scale یا managed Kubernetes.

---

## English

### Overview

This repository contains the Kubernetes manifests and lab deployment configuration for **NovaMarket**, while the application source is maintained in:

`arminsabzehi/devops-infrastructure-platform`

The documentation intentionally describes implemented and tested capabilities rather than planned technologies.

### Current status

- Kubernetes `v1.34.2`
- Namespace: `digino`
- PostgreSQL StatefulSet with persistent storage
- Database migration Job for schema and controlled seed data
- Nginx Gateway as the internal application entry point
- Gateway exposed through a `LoadBalancer` Service using MetalLB
- Application components split into independent Kubernetes Deployments
- Catalog integrated with MinIO
- Product images stored in MinIO object storage
- Catalog generates Presigned GET URLs for MinIO objects
- Private container registry for the restricted/offline lab
- Kustomize used for deployment configuration

### Architecture

```text
                         Client / Browser
                                |
                                v
                     MetalLB LoadBalancer
                         172.16.8.183:80
                                |
                                v
                         Nginx Gateway
                                |
          +---------------------+---------------------+
          |                     |                     |
          v                     v                     v
     Frontend/UI          Application APIs        Catalog API
                                                      |
                                      +---------------+---------------+
                                      |                               |
                                      v                               v
                                PostgreSQL 16                    MinIO
                                                                  |
                                                                  v
                                                        Product Images / Files
```

The existing Nginx Gateway is responsible for internal service routing. The current lab deployment does not use Kubernetes Ingress as the external entry point; the Gateway is exposed through MetalLB instead.

### Kubernetes components

The current manifests use separate Deployments for application components, including:

```text
frontend
shop
product
about
account
orders
checkout
admin
backend
catalog
user
cart
order-service
payment
shipping
search
wishlist
reviews
notification
discount
```

The base configuration also contains the namespace, PostgreSQL, migration Job, and gateway resources.

### Storage and product images

PostgreSQL uses a PersistentVolumeClaim. The StorageClass is configurable through the lab overlay rather than being tied to one specific storage implementation.

Product image binaries are stored outside PostgreSQL in MinIO. The database stores an object key such as:

```text
products/25/main.jpg
```

The corresponding object is stored in the MinIO `novamarket` bucket:

```text
novamarket/products/25/main.jpg
```

The Catalog service resolves the object key into a temporary Presigned URL for clients.

### Image replacement model

A key architectural improvement in the current implementation is separating product files from the application deployment lifecycle.

Replacing a product image does not require:

- a new database migration
- a new Docker image
- a Kubernetes redeployment

Database migrations remain appropriate for schema changes and controlled data changes, while routine product-image replacement is handled through object storage.

### Private registry and restricted/offline lab

The current lab uses a private container registry so Kubernetes nodes can pull images without depending on a public registry at runtime.

Example lab registry hostname:

```text
reg.test.local
```

Registry credentials are intentionally not stored in this repository.

### Kustomize layout

```text
k8s/
├── base/
│   ├── namespace.yaml
│   ├── postgres.yaml
│   ├── db-migrate.yaml
│   ├── gateway.yaml
│   ├── frontend/
│   ├── shop/
│   ├── product/
│   ├── about/
│   ├── account/
│   ├── orders/
│   ├── checkout/
│   ├── admin/
│   ├── backend/
│   ├── catalog/
│   ├── user/
│   ├── cart/
│   ├── order-service/
│   ├── payment/
│   ├── shipping/
│   ├── search/
│   ├── wishlist/
│   ├── reviews/
│   ├── notification/
│   └── discount/
└── overlays/
    └── lab/
        └── kustomization.yaml
```

### Deployment

Apply the lab overlay:

```bash
kubectl apply -k k8s/overlays/lab
```

Check the deployment:

```bash
kubectl -n digino get pods -o wide
kubectl -n digino get svc
```

### Project scope

This repository is a practical Kubernetes/DevOps lab. It demonstrates a deployable and testable Kubernetes environment without claiming production-scale managed Kubernetes, public-cloud infrastructure, or other capabilities that are not part of the current implementation.

---

## Related repository

Application source and database migrations:

`arminsabzehi/devops-infrastructure-platform`
