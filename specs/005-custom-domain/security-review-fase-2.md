# Informe de Auditoría de Seguridad — Feature 005, Fase 2 (orígenes CORS compuestos por el pipeline)

**Fecha**: 2026-10-25 · **Auditor**: `mytasks-security-auditor` · **Alcance**: rama `feature/005-custom-domain-fase-2`
(`.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `.github/scripts/cors-origins.sh` y sus tests).
**Tipología detectada**: API REST (FastAPI) + CI/CD y cloud-native en GCP (Cloud Run).
**Marcos aplicados**: OWASP API Security Top 10 (API8 configuración incorrecta de seguridad), OWASP Top 10
(A05 Security Misconfiguration, A08 Software and Data Integrity Failures) y CIS Google Cloud Foundation Benchmark
(identidades y configuración de servicios).
**Nivel de riesgo global**: **Bajo**.

---

## Resumen ejecutivo

La fase cambia **quién decide y cómo se aplica la lista de orígenes CORS de la API**: pasa de un valor fijo a una
lista que compone `cors-origins.sh` a partir de una variable no secreta del entorno de GitHub
(`CUSTOM_WEB_ORIGINS`), la escribe `deploy.yml` en cada revisión y la verifica antes de mover tráfico. No toca
autenticación, autorización ni el modelo de datos, pero sí una **frontera de confianza del navegador** (qué webs pueden
llamar a la API), por eso se revisa (Principio III).

Resultado: **sin hallazgos críticos, altos ni medios**. Un hallazgo bajo se encontró y **se corrigió en la propia
fase** (LOW-001); otro queda en el backlog (LOW-002). No bloquea el paso a producción.

Contexto que acota el riesgo (verificado en el código):

- La API no admite credenciales de navegador: `CORSMiddleware` se configura sin `allow_credentials`
  (`backend/src/mytasks_api/factory.py:78-83`) y la autenticación es por cabecera `Authorization: Bearer`. Un origen
  añadido a la lista **no obtiene acceso por sí mismo**: sigue necesitando un token válido que solo existe en el
  almacenamiento de la web legítima.
- Cada despliegue **sobrescribe** `CORS_ORIGINS` con `--update-env-vars`; un origen añadido a mano en la consola
  desaparece en el siguiente despliegue y la comprobación posterior lo detecta antes de mover tráfico.

---

## Hallazgos

### [LOW-001] El validador de orígenes aceptaba direcciones IP — CORREGIDO en esta fase
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API8:2023 Security Misconfiguration |
| **Componente afectado** | `.github/scripts/cors-origins.sh` |

**Descripción**
La primera versión del validador aceptaba `https://127.0.0.1` y `https://10.0.0.1` como orígenes (cumplen el patrón
de dominio con etiquetas numéricas). El contrato pide nombres de dominio, no direcciones: una IP en la lista abriría la
API a una web servida desde una dirección que no se puede asociar a un dominio del propietario.

**Evidencia**
Los tres casos añadidos a `test_cors_origins.py` (`https://127.0.0.1`, `https://10.0.0.1`, `https://inserttask.123`)
fallaban antes del arreglo (3 `FAIL`) y pasan después.

**Remediación aplicada**
El validador rechaza cualquier origen cuya última etiqueta sea numérica, y el mensaje de error lo dice.

**Destinatario**: `mytasks-iac-developer` (cambio de implementación) — hecho en esta PR.

### [LOW-002] Dos fuentes de verdad para el mismo dominio (CORS y dominios autorizados) — backlog
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A05: Security Misconfiguration (deriva de configuración) |
| **Componente afectado** | `CUSTOM_WEB_ORIGINS` (variable de GitHub) frente a `custom_domains` de Terraform (Fase 3/4) |

**Descripción**
El dominio propio acabará declarado en dos sitios independientes: la variable de GitHub que alimenta `CORS_ORIGINS`
y la lista de dominios del módulo de Terraform que alimenta los dominios autorizados de Identity Platform, los
*referrers* de la clave de API y los dominios de Hosting. Nada compara ambos. Una deriva produciría, o un origen
con CORS pero sin inicio de sesión (inofensivo), o un dominio en servicio cuya web no puede llamar a la API (fallo
funcional), o —el caso a evitar— un origen con CORS que ya no figura entre los dominios declarados.

**Evidencia**
`contracts/pipeline-env.md` §1 y §2: las dos listas se mantienen por separado; no hay tarea que las contraste.

**Remediación requerida**
Añadir una comprobación explícita de que ambas listas coinciden en la validación de staging (E6/T059) y de
producción (T047), y anotar en `infra/RUNBOOK.md` §14 que se cambian juntas. Valorar en la Fase 4 si el contraste
puede automatizarse (p. ej. un test que lea `custom_domains` de los dos *roots* y los compare con el valor esperado de
la variable). No bloquea esta fase.

**Destinatario**
- Skill/agente: `mytasks-iac-developer`
- Tipo de cambio: De implementación / de procedimiento

---

## Observaciones sin severidad (comprobadas, sin acción)

| Tema | Resultado |
|---|---|
| Inyección en el workflow | Correcto. `CUSTOM_WEB_ORIGINS` y la lista compuesta viajan por `env`, nunca interpoladas en el `run`. Los orígenes validados (solo `[a-z0-9.-]`) no pueden contener saltos de línea, comillas ni `|`, así que no inyectan en `$GITHUB_OUTPUT`, en `--update-env-vars` ni en el programa `jq` (los valores esperados entran con `--arg`) |
| Delimitador `^|^` de `gcloud` | Correcto. Ningún valor puede contener `|`: hashes hexadecimales, orígenes validados y el correo del administrador, cuya validación se ha reforzado para excluirlo (con test) |
| Globbing de la variable | Correcto. `set -f` impide que un `*` se expanda a nombres de fichero; hay test con directorio con ficheros |
| Aislamiento entre entornos | Correcto. Staging solo admite orígenes `https://staging.*` y producción ninguno; la comprobación previa sigue exigiendo la web del propio entorno en la lista, así que un servicio con la configuración del otro entorno falla |
| Comprobación posterior | Correcto. Compara la lista **exacta** de la revisión nueva antes de mover tráfico y falla sin tocar el tráfico; imprime solo orígenes, no otras variables |
| Fallo cerrado | Aceptado. Una variable mal formada bloquea el despliegue del entorno, incluido un *hotfix*, hasta corregirla; el mensaje nombra el valor y la RUNBOOK §11 lo explica |
| Confianza en la variable | Aceptado. Quien puede editar variables de un entorno de GitHub es administrador del repositorio, el mismo nivel de confianza que quien edita los workflows; no se añade una lista blanca por encima del formato |
| Dependencias y acciones | Sin cambios en acciones de terceros; `pyyaml==6.0.2` fijado como en los pasos existentes; `cors-origins.sh` no instala nada |
| Secretos | Ninguno nuevo. Los orígenes son públicos por naturaleza |

## Categorías sin hallazgos o no aplicables a esta fase

Autenticación y autorización (no se tocan), exposición de datos sensibles (los mensajes solo contienen orígenes),
seguridad de red y perímetro (no cambia la superficie: la API ya era pública y su lista de orígenes solo se amplía a
valores validados), logging y detección (el despliegue sigue dejando su resumen y `::error::` con el valor ofensor) e
incidentes y recuperación (quitar un dominio es borrar la variable y desplegar). **Información insuficiente para
valorar**: la existencia real de la variable `CUSTOM_WEB_ORIGINS` en los entornos de GitHub no se puede leer sin
credenciales; consta por confirmación del propietario.

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente | Estado |
|---|---|---|---|---|
| LOW-001 | Baja | Desarrollador IaC / pipeline | `mytasks-iac-developer` | Corregido en la PR de la Fase 2 |
| LOW-002 | Baja | Desarrollador IaC | `mytasks-iac-developer` | Backlog (Fases 3–5: contraste de listas y nota en RUNBOOK §14) |

**Conclusión**: la fase puede fusionarse. Antes de la release, repetir la comprobación de LOW-002 en el ensayo de staging
(E6/T059) y en producción (T047).
