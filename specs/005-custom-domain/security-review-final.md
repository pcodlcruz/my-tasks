# Informe de Auditoría de Seguridad — Feature 005, revisión final (dominio propio con Cloud DNS)

**Fecha**: 2026-10-26 · **Auditor**: `mytasks-security-auditor` · **Alcance**: rama
`feature/005-custom-domain-fase-6`, que incluye las fases 1–5 y T074 ya fusionadas en `develop`
(`infra/modules/environment/{hosting,dns,identity}.tf`, `infra/envs/*`, `infra/iam/roles/*`,
`.github/scripts/{cors-origins,custom-domains-summary}.sh`, `deploy.yml`, `infra.yml` y la documentación operativa).
Integra el informe de la Fase 2 ([security-review-fase-2.md](./security-review-fase-2.md)).
**Tipología detectada**: aplicación web (React) + API REST (FastAPI) + cloud-native en GCP (Firebase Hosting, Cloud DNS,
Cloud Run, Identity Platform) + CI/CD.
**Marcos aplicados**: OWASP Top 10 (A05 Security Misconfiguration, A07 Identification and Authentication Failures),
OWASP API Security Top 10 (API8), CIS Google Cloud Foundation Benchmark (identidades, DNS y configuración de servicios).
**Nivel de riesgo global**: **Bajo**.

---

## Resumen ejecutivo

La feature pone la aplicación detrás de Firebase Hosting, le da el dominio `inserttask.es` con certificado gestionado y
lleva el DNS a Cloud DNS (una zona pública por entorno). Toca la frontera de confianza del navegador (CORS, dominios
autorizados de Identity Platform y *referrers* de la clave de API), nuevos permisos de IAM y una superficie nueva de DNS,
por eso la revisión es obligatoria (Principio III). **No cambia el modelo de datos ni la lógica de autorización.**

Resultado: **sin hallazgos críticos ni altos**. Un hallazgo **medio** (delegación `NS` que puede quedar huérfana), **corregido
en esta fase** como procedimiento en la RUNBOOK, y tres **bajos** en backlog. **No bloquea el paso a producción**, con una
condición previa ya prevista: restaurar `prevent_destroy` (T073) antes de crear la release.

---

## Hallazgos

### [MED-001] La delegación de `staging` desde la zona de producción puede quedar huérfana — CORREGIDO (procedimiento)
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP A05 / CIS GCP (DNS): toma de subdominio por delegación `NS` huérfana |
| **Componente afectado** | `infra/envs/production/main.tf` (`dns_delegations`), zona `staging.inserttask.es` del proyecto de staging |

**Descripción**
El registrador no admite un `NS` de subdominio, así que la zona de producción delega `staging.inserttask.es` hacia los
cuatro servidores de nombres de la zona de staging. Si esa zona se borrara (o el proyecto de staging se retirara) y el
`NS` siguiera en la zona de producción, `staging.inserttask.es` quedaría delegado a servidores que ya no responden por él.
Cloud DNS permite crear una zona con cualquier nombre sin demostrar la propiedad del dominio, de modo que un tercero podría
intentar crear una zona del mismo nombre y servir contenido bajo un subdominio del dominio de producción (suplantación,
*phishing* con un nombre legítimo). La documentación de Cloud DNS consultada no describe este escenario ni su mitigación
(ver «Información insuficiente»), por lo que se trata como riesgo genérico de delegaciones huérfanas.

**Evidencia**
`dns_delegations = { staging = [ns-cloud-d1…d4.googledomains.com.] }` en el root de producción. La zona de staging lleva
`prevent_destroy` en `dns.tf`, lo que impide el borrado accidental, pero no el deliberado, y la RUNBOOK no decía en qué
orden retirar zona y delegación (el apartado «Retirar un dominio» solo hablaba de los registros).

**Remediación aplicada**
`infra/RUNBOOK.md` §14, «Retirar un dominio»: antes de borrar la zona de staging o su dominio hay que quitar
`dns_delegations` del root de producción y aplicarlo; solo después se levanta `prevent_destroy` de la zona.

**Destinatario**: `mytasks-iac-developer` (cambio de procedimiento) — hecho en esta PR.

### [LOW-001] Dos fuentes de verdad para el mismo dominio (CORS y dominios autorizados) — arrastrado de la Fase 2
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A05: deriva de configuración |
| **Componente afectado** | Variable `CUSTOM_WEB_ORIGINS` de GitHub frente a `custom_domains` de Terraform |

**Descripción**
Sigue sin haber un contraste automático entre la variable de GitHub (que alimenta `CORS_ORIGINS`) y la lista de dominios
de Terraform. El test de paridad (`test_env_roots_parity.py`) fija los dominios de cada root, y `cors-origins.sh` impide que
un entorno herede el origen del otro, pero el valor real de la variable de GitHub no se puede leer sin credenciales.

**Evidencia**
Las variables solo constan por confirmación del propietario (2026-10-26). El contraste efectivo es manual: T059 (staging)
y T047 (producción) leen `CORS_ORIGINS` de la API con el MCP en solo lectura.

**Remediación requerida**
Mantener los contrastes de T047 y T059 en la validación posterior a la release (ya en `tasks.md`). Valorar un test que
compare `custom_domains` con el valor esperado de la variable cuando el pipeline permita leerla.

**Destinatario**: `mytasks-iac-developer` · De procedimiento / implementación · Backlog.

### [LOW-002] DNSSEC no está activado
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | CIS GCP (DNS): integridad de las respuestas DNS |
| **Componente afectado** | Zonas `inserttask.es` y `staging.inserttask.es` |

**Descripción**
Las zonas no están firmadas, así que las respuestas DNS no son verificables por los resolvedores que validan (envenenamiento
de caché). Es una decisión conocida: la especificación lo deja fuera de alcance porque exige publicar el registro `DS` en
el registrador y un error rompe la resolución del dominio.

**Evidencia**
`dns.tf` no declara `dnssec_config`; `spec.md` (Assumptions) lo deja como decisión pendiente del propietario.

**Remediación requerida**
Valorar activar DNSSEC en una feature propia, una vez que el dominio lleve unas semanas estable: firmar la zona de producción
y publicar el `DS` en el registrador, con prueba previa en la zona de staging cuando pueda resolver.

**Destinatario**: `mytasks-google-cloud-architect` (decisión) y `mytasks-iac-developer` · Arquitectónico · Backlog.

### [LOW-003] Sin registros `CAA`: cualquier autoridad certificadora puede emitir para el dominio
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | CIS GCP / buenas prácticas de PKI |
| **Componente afectado** | Zona `inserttask.es` |

**Descripción**
Sin `CAA`, cualquier CA puede emitir un certificado para `inserttask.es`. La documentación de Hosting confirma que los
`CAA` son opcionales y que, si se declaran, deben permitir `pki.goog` y `letsencrypt.org` o la emisión se queda en
«Pending».

**Evidencia**
`dns.tf` solo declara `TXT`, `A` y `NS` (el test de paridad lo exige); `contracts/edge.md` §3 deja los `CAA` fuera.

**Remediación requerida**
Una vez emitido el certificado, valorar declarar `0 issue "pki.goog"` y `0 issue "letsencrypt.org"` en la zona de
producción. Hacerlo después de la validación (T049) para no arriesgar la emisión.

**Destinatario**: `mytasks-iac-developer` · De configuración · Backlog.

---

## Observaciones comprobadas, sin acción

| Tema | Resultado |
|---|---|
| Dominios autorizados de Identity Platform | Correcto. Lista exacta, sin comodines y sin `localhost`; solo entran los dominios que sirven la web (`served_custom_domains` excluye `www`, que redirige) (`identity.tf:10,19-26`) |
| *Referrers* de la clave de API web | Correcto. Cada origen con `/*` solo sobre su host, sin comodines de host; la clave sigue limitada a `identitytoolkit` y `securetoken` (`identity.tf:41-58`) |
| Lista CORS | Correcto. `cors-origins.sh` valida formato, rechaza IP y comodines y aísla entornos; la API no usa credenciales de navegador (informe de la Fase 2) |
| Rol `mytasksDnsAdmin` | Correcto. 13 permisos de zonas, registros y cambios; sin política IAM, zonas privadas, políticas ni claves DNSSEC (`infra/iam/roles/dns-admin.yaml`). Concedido solo a `terraform-<entorno>` en su proyecto (verificado en solo lectura, T063) |
| `mytasksPlanReader` | Correcto. Solo 4 lecturas de DNS y 2 de Hosting añadidas; sigue sin datos, usuarios ni secretos |
| `roles/firebasehosting.admin` | Aceptado. Solo `terraform-<entorno>`; mitigado por la aprobación del propietario en `infra-staging` / `infra-production` y por `prevent_destroy` (en el sitio y la zona). Hosting no tiene contenido propio: todo va a `mytasks-web` |
| Registros DNS | Correcto. Solo `TXT`, `A` y `NS`, **ningún `AAAA`** (test de paridad); el `TXT` de propiedad es permanente |
| Dirección `199.36.158.100` | La fija la documentación de Hosting y va en `local.hosting_ip`. Un cambio de Google sería un fallo de disponibilidad, no de seguridad |
| Proveedor beta de Hosting | Aceptado. `google-beta ~> 8.6.0`, fijado y con `.terraform.lock.hcl` idéntico en los dos roots |
| URL adicional `web.app` | Aceptado. Sirve la misma aplicación que `run.app`, con el mismo CORS y los mismos dominios autorizados; no añade superficie nueva |
| Cabeceras a través de Hosting | Comprobado en staging con `curl` (T029, 8 de 9 escenarios; el noveno, rendimiento, se resolvió con el umbral absoluto): mismas cabeceras de seguridad y `Cache-Control: no-store` en `/` y `/config.js` |
| Secretos | Ninguno nuevo. Zonas, registros y servidores de nombres son públicos |
| Cadena de suministro | Sin acciones de terceros nuevas; los scripts nuevos no instalan nada |
| `prevent_destroy` del dominio de Hosting | **Levantado a propósito** en la Fase 5 para retirar `staging.inserttask.com`. **Condición previa a la release: T073 lo restaura** en una PR propia |

## Información insuficiente para valorar

- **Dominios autorizados y subdominios**: la documentación de Firebase Authentication consultada no dice si autorizar
  `inserttask.es` autoriza también sus subdominios. Si lo hiciera, un subdominio comprometido (ver MED-001) podría iniciar el
  flujo de inicio de sesión de la web de producción. Cómo comprobarlo: probar el inicio de sesión desde `staging.inserttask.es`
  contra el proyecto de producción durante el ensayo, o consultar a soporte. No cambia la severidad actual: el flujo usa
  `signInWithPopup` y el token solo vive en el almacenamiento del origen legítimo.
- **Dangling NS en Cloud DNS**: la documentación consultada no describe el escenario; el MED-001 se apoya en el riesgo genérico.
- **Variables de GitHub y estado de Hosting** (`ownership_state`, `cert.state`): no se pueden leer sin credenciales ni con
  `gcloud`; constan por lectura del propietario en el resumen del job.

## Categorías sin hallazgos o no aplicables

Autenticación y autorización de la aplicación (no se tocan; solo se amplía el origen permitido), exposición de datos
sensibles (nada sensible en registros DNS ni en los mensajes del pipeline), logging y detección (los cambios de DNS quedan en
los registros de auditoría de Cloud DNS y el `apply` en el historial de GitHub Actions) e incidentes y recuperación (retirar
un dominio es un PR con aprobación; el procedimiento está en la RUNBOOK §14).

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente | Estado |
|---|---|---|---|---|
| MED-001 | Media | Desarrollador IaC | `mytasks-iac-developer` | Corregido (RUNBOOK §14, «Retirar un dominio») |
| LOW-001 | Baja | Desarrollador IaC | `mytasks-iac-developer` | Backlog (contrastes en T047 y T059) |
| LOW-002 | Baja | Arquitecto / IaC | `mytasks-google-cloud-architect` | Backlog (feature futura de DNSSEC) |
| LOW-003 | Baja | Desarrollador IaC | `mytasks-iac-developer` | Backlog (tras T049) |

**Conclusión**: la feature puede ir a producción sin hallazgos críticos ni altos. Condiciones antes de crear la release:
T073 (`prevent_destroy` restaurado) y T061 (cierre de staging fusionado). Después de la release, repetir los contrastes de
LOW-001 en T047 y T059 y resolver la duda sobre dominios autorizados y subdominios durante el ensayo.
