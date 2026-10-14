# Informe de Auditoría de Seguridad — Fase 5: producción y promoción

**Feature**: `002-cloud-run-cicd` | **Rama**: `feature/002-cloud-run-cicd-fase-5` (PR #37) | **Fecha**: 2026-10-14

**Tipología detectada**: Cloud-native / GCP (IaC, IAM, Cloud Run, Firestore, Identity Platform), pipeline CI/CD (cadena de suministro y despliegue a producción) y API REST.
**Marcos aplicados**: CIS Google Cloud Foundation Benchmark, OWASP CI/CD Security Risks, OWASP API Security Top 10.
**Nivel de riesgo global**: **Medio** (por un hallazgo heredado de la Fase 4 que esta fase vuelve más importante)

---

## Resumen ejecutivo

Se auditó el diff de la fase: la raíz `infra/envs/production/`, `deploy-production.yml`, el test de paridad entre raíces, la guía de roles de producción y la documentación, junto con el estado de producción leído en solo lectura y la configuración pública de los *environments* de GitHub.

**No hay hallazgos críticos ni altos nuevos.** Hay **un hallazgo bajo nuevo** (los administradores pueden saltarse la protección del *environment* `production`) y **dos temas ya abiertos** que esta fase vuelve urgentes porque ahora afectan a datos y a un despliegue reales: la procedencia de las imágenes (MED-001 de la Fase 4) y la recuperación de Firestore (LOW-003 de la Fase 4). **Se recomienda resolver los dos antes de T081**, el primer despliegue de producción.

Lo importante de lo que está bien: producción no construye nunca, solo promueve el *digest* que staging validó; el *environment* `production` solo admite `main` y exige la aprobación del propietario; las dos raíces se comparan automáticamente y no pueden desviarse sin que falle el CI.

**Limitaciones**: `terraform validate` y `plan` no se ejecutan en el sandbox del agente, y la vista previa de producción salió como aviso porque `terraform-plan-production` aún no tiene sus roles (los crea el propietario). El comportamiento real de la raíz contra Google Cloud se observará en el primer `apply`.

---

## Hallazgos

### [LOW-001] Los administradores pueden saltarse la protección del *environment* `production`
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP CI/CD: Insufficient flow control mechanisms |
| **Componente afectado** | *Environment* `production` de GitHub (configuración, no código) |

**Descripción**
El *environment* `production` exige la aprobación del propietario, pero permite que los administradores del repositorio se salten esas reglas. El *environment* `infra-production`, que protege el `apply` de Terraform sobre el mismo proyecto, no lo permite. Con un solo administrador, que es además el revisor, el efecto práctico es que un token de administrador comprometido podría desplegar a producción sin la aprobación.

**Evidencia**
Respuesta pública de la API de GitHub: `environments/production` → `can_admins_bypass: true`; `environments/infra-production` → `can_admins_bypass: false`. Ambos tienen `required_reviewers` (propietario) y política de ramas `main`.

**Remediación requerida**
Desactivar *Allow administrators to bypass configured protection rules* en `production`, igual que en `infra-production`.

**Destinatario**
- Skill/agente: propietario (ajuste de GitHub; el agente no puede cambiarlo)
- Tipo de cambio: De configuración.

---

### Heredado de la Fase 4, ahora urgente

**MED-001 (Fase 4): la procedencia de la imagen no se comprueba antes de desplegarla y validarla.** Producción solo promueve lo que lleva `validated-<hash>`, y esa etiqueta la pone el pipeline de staging sobre la imagen que haya en el registro, sin comprobar que se construyó a partir de ese árbol. Quien pudiera ejecutar código con la identidad `deployer-staging` (que tiene escritura en el repositorio) podría dejar una imagen cualquiera con el hash de un árbol futuro y validarla. Para ello hace falta que un workflow se ejecute en `develop`, `release/*` o `hotfix/*`, ramas protegidas. Con la Fase 5, esa imagen acabaría en producción. Sigue siendo **Media**, pero conviene resolverla antes del primer despliegue de producción. Remediación y destinatario: ver `security-review-fase-4.md`.

**LOW-003 (Fase 4): Firestore sin recuperación a un punto en el tiempo ni copias programadas.** La raíz de producción crea la base con `POINT_IN_TIME_RECOVERY_DISABLED`. A diferencia de staging, ahí vivirán datos reales de tareas, y un borrado definitivo por un fallo de la aplicación o un token comprometido no se podría deshacer. Las especificaciones no exigen copias, así que es una decisión por tomar y dejar por escrito, no un incumplimiento. Recomendación: decidirlo antes de T081 (la recuperación a un punto en el tiempo es barata para este volumen) y, si se activa, añadir una variable al módulo para que staging pueda seguir sin ella.

---

## Qué está bien

- **Promoción, no construcción**: `deploy.yml` comprueba `validated-<hash>` de los dos componentes antes de tocar nada en producción y despliega por *digest*; el humo y la comprobación de variables (valor, no solo presencia) corren antes de mover tráfico.
- **Protección del despliegue**: el *environment* `production` admite solo la rama `main` y exige la aprobación del propietario; la federación de `deployer-production` está ligada a ese *environment*; el grupo de concurrencia es propio y no cancela el despliegue en curso.
- **Paridad automática**: `test_env_roots_parity.py` falla si las dos raíces difieren en algo que no sea dimensionado e identificadores; se comprobó que detecta una desviación.
- **Sin duplicar ni ampliar**: la raíz de producción no declara las cuentas del pipeline ni la auditoría de datos (son de la plataforma), y la auditoría está desactivada en el módulo para no pisarla.
- **Mínimo privilegio**: los roles de producción son los mismos tres personalizados de staging (sin documentos, usuarios, secretos ni borrado de bases); el agente de servicio de Cloud Run lee el repositorio sin concesión extra.
- **Identity Platform adoptado, no recreado**: el `import` evita reinicializarlo; el proveedor de inicio de sesión no se toca.

---

## Información insuficiente (no se ha podido auditar)

| Tema | Por qué no se pudo | Qué haría falta |
|---|---|---|
| Plan real de producción y de la plataforma | La vista previa salió como aviso: faltan los roles de `terraform-plan-production` | Que el propietario cree los roles y se relance el check; después, el resumen del plan |
| Dominios autorizados de Identity Platform de producción | El agente no puede leerlos sin una clave de API; la API de claves no estaba habilitada | Leer el plan: Terraform los sustituirá por los del proyecto y la web de producción; cualquier otro (por ejemplo `localhost`) desaparece |
| Clave de API creada automáticamente por Firebase en producción | La API de claves estaba deshabilitada, no se pudo listar | Tras el `apply` (que la habilita), listar las claves y restringir o borrar la que no use la aplicación, como en staging |
| *Rulesets* de `main`, `develop`, `release/*` y `hotfix/*` con los nueve checks requeridos | Es T080 y está pendiente del propietario | Que el propietario lo configure y lo confirme |

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| LOW-001 | Baja | Propietario (ajuste de GitHub) | — |
| MED-001 (Fase 4) | Media | Workflow (a mano); diseño de firma si se quiere | ninguno cubre Actions; `mytasks-google-cloud-architect` |
| LOW-003 (Fase 4) | Baja | Decisión de arquitectura, luego IaC | `mytasks-google-cloud-architect` → `mytasks-iac-developer` |
