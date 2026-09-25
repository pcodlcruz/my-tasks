# GCP Architecture Quick Reference — Referencia Rápida para el agente google-cloud-architect

Documento de lookup operacional. Matrices de selección de servicios, patrones de red, IAM roles frecuentes y guías de HA/DR. Complementa la documentación actualizada del MCP `google-developer-knowledge`.

---

## Compute — Matriz de Selección

| Criterio | Cloud Run | Cloud Functions | GKE Autopilot | Compute Engine | Batch |
|---|---|---|---|---|---|
| **Unidad de despliegue** | Contenedor | Función | Pod (contenedor) | VM | Job (contenedor/VM) |
| **Escala a cero** | Sí | Sí | No (nodos mínimos) | No | N/A |
| **Tiempo arranque en frío** | ~1-2 s | ~100-500 ms | Variable | ~60-120 s | Variable |
| **Máx. duración de request** | 60 min | 9-60 min | Sin límite | Sin límite | Sin límite |
| **Estado local en instancia** | Efímero | No | Vol. efímero/PVC | Disco persistente | PD / GCS |
| **GPU** | No | No | Sí | Sí | Sí |
| **Control de red (VPC)** | Sí (VPC Connector/Direct) | Sí (conector) | Nativo | Nativo | Nativo |
| **Caso de uso principal** | APIs, microservicios, workers | Event-driven, webhooks | Workloads k8s complejos | VMs legacy, control total | ML training, data processing |

### Reglas de selección rápida

- **Default serverless** → Cloud Run (carga variable, sin estado, API HTTP o gRPC).
- **Event muy corto (<9 min), trigger GCP** → Cloud Functions (Pub/Sub, GCS events, Firestore triggers).
- **Runtime especial, GPU, stateful, RBAC granular** → GKE Autopilot.
- **Workload legacy, licencia OS específica, acceso raw a hardware** → Compute Engine.
- **Batch/ML, tolerante a interrupciones** → Batch + Spot VMs.

---

## Bases de Datos — Matriz de Selección

| Servicio | Modelo | Consistencia | Escala horizontal | Multi-región activo-activo | Caso de uso |
|---|---|---|---|---|---|
| **Cloud SQL** | Relacional (PostgreSQL / MySQL / SQL Server) | Strong | No (replicas solo lectura) | Sí (Cloud SQL for PG con replication) | OLTP clásico, apps existentes |
| **Cloud Spanner** | Relacional distribuido | External strong | Sí | Sí (global) | OLTP global, alta disponibilidad, finanzas |
| **Firestore** | Documento (NoSQL) | Strong (single doc) | Sí | Multi-region | Apps móviles/web, datos jerárquicos |
| **Bigtable** | Wide-column (NoSQL) | Eventual | Sí (nodos) | Sí (replication) | IoT, séries temporales, ML features |
| **Memorystore Redis** | Key-value en memoria | No persistente por defecto | No (clustering opcional) | No | Caché, sesiones, colas ligeras |
| **BigQuery** | Analítico (columnar) | Eventual (streaming) | Sí (serverless) | Multi-region | OLAP, data warehouse, analytics |
| **AlloyDB** | Relacional PostgreSQL-compatible | Strong | Read pools | Sí (cross-region replicas) | OLTP de alto rendimiento, migración de Oracle |
| **Firestore in Datastore mode** | Documento heredado | Eventual (queries) | Sí | Multi-region | Compatibilidad con apps Datastore existentes |

### Reglas de selección rápida

- **SQL + escala global + SLA 99.999%** → Spanner.
- **SQL + carga predecible + <regional** → Cloud SQL (HA con failover automático).
- **SQL + alto rendimiento OLTP + migración Oracle/PostgreSQL** → AlloyDB.
- **Datos flexibles, app móvil/web, realtime** → Firestore.
- **Millones de escrituras/s, series temporales** → Bigtable.
- **Analytics, data warehouse** → BigQuery.
- **Caché, rate limiting, sesiones** → Memorystore.

---

## Networking — Patrones de VPC

### Topología estándar (tres capas)

```
Internet
    │
    ▼
[Cloud Load Balancing + Cloud Armor]  ← capa DMZ pública
    │
    ▼
[Subred privada — servicios frontend/API]  e.g. 10.0.1.0/24
    │
    ▼
[Subred privada — servicios backend/datos]  e.g. 10.0.2.0/24
    │
    ▼
[Private Service Connect / VPC Peering → servicios gestionados]
(Cloud SQL, Memorystore, Vertex AI, etc.)
```

### Reglas de VPC mínimas

| Regla | Dirección | Prioridad | Por qué |
|---|---|---|---|
| `deny-all-ingress` | Ingress | 65534 | Rechazo implícito explícito |
| `allow-internal` | Ingress | 1000 | Comunicación entre subredes internas |
| `allow-health-check` | Ingress | 900 | Load Balancer health probes (`130.211.0.0/22`, `35.191.0.0/16`) |
| `allow-iap-ssh` | Ingress | 800 | SSH via IAP (`35.235.240.0/20`) |

### Acceso a servicios gestionados

- **Private Service Connect (PSC)** → acceso privado a APIs Google y servicios de terceros. Preferido sobre VPC Peering por IP routing más simple.
- **VPC Peering** → conectar dos VPCs propias; no transitivo.
- **Shared VPC** → centralizar red en host project; proyectos de servicio usan las subredes del host. Usar para separación de facturación manteniendo red unificada.
- **Cloud NAT** → egress a internet desde instancias sin IP pública; sin estado de connection tracking entrante.

---

## IAM — Roles Frecuentes por Servicio

### Compute / Cloud Run / GKE

| Rol | Para qué |
|---|---|
| `roles/run.invoker` | Invocar un Cloud Run service (identity binding en el servicio) |
| `roles/run.developer` | Deploy de nuevas revisiones de Cloud Run |
| `roles/container.developer` | Acceso a clusters GKE para despliegue de workloads |
| `roles/compute.instanceAdmin.v1` | Administración completa de VMs (CI/CD pipelines) |
| `roles/compute.osLogin` | Login SSH con IAP (en lugar de metadata SSH keys) |

### Datos

| Rol | Para qué |
|---|---|
| `roles/cloudsql.client` | Conexión a Cloud SQL via Cloud SQL Auth Proxy |
| `roles/cloudsql.instanceUser` | Autenticación IAM a nivel de usuario PostgreSQL |
| `roles/bigquery.dataViewer` | Leer tablas BigQuery (solo lectura) |
| `roles/bigquery.jobUser` | Ejecutar queries (necesita también `dataViewer`) |
| `roles/datastore.user` | Leer/escribir en Firestore |
| `roles/bigtable.reader` | Leer desde Bigtable |
| `roles/storage.objectViewer` | Leer objetos GCS |
| `roles/storage.objectCreator` | Crear objetos GCS (write-only; no leer ni listar) |
| `roles/storage.objectAdmin` | CRUD completo de objetos GCS |

### Seguridad y secretos

| Rol | Para qué |
|---|---|
| `roles/secretmanager.secretAccessor` | Leer el valor de un secreto (workloads en producción) |
| `roles/secretmanager.secretVersionAdder` | Añadir nuevas versiones de un secreto (CI/CD) |
| `roles/cloudkms.cryptoKeyEncrypterDecrypter` | Usar CMEK para cifrar/descifrar |
| `roles/iam.serviceAccountTokenCreator` | Impersonar otra Service Account (con cuidado; auditar) |

### Pub/Sub

| Rol | Para qué |
|---|---|
| `roles/pubsub.publisher` | Publicar mensajes en un topic |
| `roles/pubsub.subscriber` | Leer mensajes de una subscription |

### Observabilidad

| Rol | Para qué |
|---|---|
| `roles/monitoring.metricWriter` | Escribir métricas custom (workloads) |
| `roles/logging.logWriter` | Escribir logs (workloads; GKE nodes) |
| `roles/cloudtrace.agent` | Enviar traces a Cloud Trace |
| `roles/errorreporting.writer` | Reportar errores a Error Reporting |

---

## HA / DR — Estrategias y Trade-offs

### Estrategias de disponibilidad

| Estrategia | RTO | RPO | Complejidad | Costo relativo |
|---|---|---|---|---|
| **Single zone** | Alto (horas) | Alto | Baja | Base |
| **Multi-zone (mismo region)** | Bajo (~1 min failover) | Bajo (replicación sync) | Media | +20-30% |
| **Multi-region activo-pasivo** | Medio (~5-15 min) | Bajo (replicación async) | Alta | +2-3x |
| **Multi-region activo-activo** | Muy bajo (<1 min) | Muy bajo (sync global) | Muy alta | +3-5x |

### Multi-zona como baseline (recomendado para producción)

- **Cloud Run**: desplegado multi-zona automáticamente por región.
- **GKE Autopilot**: spread de nodos en múltiples zonas por defecto con `topologySpreadConstraints`.
- **Cloud SQL**: HA con failover automático a instancia standby en zona distinta.
- **Memorystore Redis**: Alta disponibilidad requiere tier Standard (replica en zona distinta).
- **Pub/Sub**: automáticamente multi-zona dentro de la región.

### Decisión multi-región

Justificar multi-región solo si:
1. Latencia < 20 ms para usuarios en múltiples continentes (CDN no es suficiente), o
2. Requisito regulatorio de DR en región distante, o
3. SLA >99.99% con RTO <1 min y RPO ≈ 0.

---

## Seguridad — Checklist de Arquitectura

### IAM

- [ ] Ninguna Service Account tiene `roles/owner` o `roles/editor` en el proyecto.
- [ ] Workload Identity habilitado para workloads en GKE y Cloud Run.
- [ ] SA de producción no tienen `roles/iam.serviceAccountTokenCreator` salvo necesidad explícita y auditada.
- [ ] IAM Recommender revisado mensualmente para detectar permisos no utilizados.

### Red

- [ ] Recursos de backend sin IP pública; acceso por Cloud Load Balancing o PSC.
- [ ] Cloud Armor configurado en Load Balancers con tráfico público.
- [ ] Reglas de firewall deny-all-ingress como baseline; permit solo puertos mínimos.
- [ ] VPC Flow Logs habilitados en subredes con datos sensibles.
- [ ] Private Google Access habilitado en subredes privadas.

### Datos y secretos

- [ ] Secretos en Secret Manager; rotation automática configurada para secretos críticos.
- [ ] Nunca credenciales en variables de entorno planas, código o Terraform state sin cifrado.
- [ ] CMEK activado cuando el cliente lo requiera (regulación, datos sensibles).
- [ ] Cloud Audit Logs (Data Access) habilitados para servicios con datos sensibles.

### VPC Service Controls

Usar VPC-SC para aislar proyectos con datos altamente sensibles (PII, financiero, salud). Configurar Access Policies antes de habilitar para evitar bloquear servicios legítimos. Testear en modo dry-run antes de enforce.

---

## Costos — Guía Rápida de Optimización

### Committed Use Discounts (CUD)

| Recurso | Descuento típico | Compromiso |
|---|---|---|
| Compute Engine (CPU/RAM) | 20-37% | 1 año / 3 años |
| Cloud SQL | ~25% | 1 año / 3 años |
| GKE (nodos Compute) | 20-37% | vía CUD de Compute |
| Cloud Run CPU siempre activa | ~17% | Sin compromiso (CPU siempre asignada) |

### Spot VMs

Descuento 60-91% sobre on-demand. Usar para:
- ML training
- Batch data processing
- CI/CD agents
- Cualquier workload tolerante a reinicios en <30 s.

No usar para: bases de datos, workloads stateful, servicios con SLA.

### Cloud Storage — Clases

| Clase | Acceso mínimo facturado | Cost storage | Uso |
|---|---|---|---|
| Standard | Sin mínimo | Alto | Acceso frecuente, serving |
| Nearline | 30 días | Medio | Backups, acceso mensual |
| Coldline | 90 días | Bajo | DR, acceso trimestral |
| Archive | 365 días | Muy bajo | Retención legal, acceso raro |

Configurar **Lifecycle Policies** para transición automática de objetos entre clases basada en `age` o `lastModifiedTime`.

### BigQuery — Patrones de ahorro

- Particionado por fecha + clustering por columna de filtro más frecuente → reducir bytes escaneados 70-90%.
- Reservas (slots comprometidos) para equipos con carga predecible; on-demand para cargas esporádicas.
- Caché de resultados de query habilitada por defecto (mismo SQL + mismos datos = cero costo).
- Monitorear con `INFORMATION_SCHEMA.JOBS` para identificar queries caros sin partición.

---

## Observabilidad — Instrumentación Mínima

| Señal | Servicio GCP | Configuración recomendada |
|---|---|---|
| Métricas | Cloud Monitoring | Uptime checks + alertas en latencia p99 y tasa de errores |
| Logs | Cloud Logging | Log severity WARN+ en producción; ERROR siempre en Cloud Error Reporting |
| Traces | Cloud Trace | Auto-instrumentación en Cloud Run y GKE via OpenTelemetry |
| Errores | Cloud Error Reporting | Integrado con Cloud Logging (agrupación automática) |
| SLOs | Cloud Monitoring SLO | Definir SLI (latencia/disponibilidad) y SLO objetivo desde el primer día |

### Alertas de billing obligatorias

Crear presupuestos en Cloud Billing con alertas al 50%, 90% y 100% del presupuesto mensual. Notificar via Pub/Sub → Cloud Run para acciones automáticas (e.g., disable APIs no críticas).
