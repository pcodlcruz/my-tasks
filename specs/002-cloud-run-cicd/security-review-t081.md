# Informe de Auditoría de Seguridad — Ampliación de permisos de `terraform-production` (T081, PR #42)

**Fecha**: 2026-10-16
**Tipología detectada**: Cloud-native / GCP (IAM, federación de identidad, Terraform) y pipeline de CI/CD
**Marcos aplicados**: CIS Google Cloud Foundation Benchmark (sección IAM), principio de mínimo privilegio, OWASP CI/CD Security (ejecución de código no confiable en el pipeline)
**Nivel de riesgo global**: Bajo para este cambio. Sin hallazgos críticos ni altos; no bloquea la release.

---

## Resumen ejecutivo

Se revisó la concesión de `mytasksPlanReader` y `mytasksPlatformPlanReader` a `terraform-production` en `pdlco-mytasks`, hecha para que `main` aplique `platform` y `envs/production` (el `apply` del 2026-10-15 falló porque la cuenta no podía leer `platform`). También se revisó la anotación `::error::` nueva de `infra-plan.sh`.

**Conclusión: los dos roles nuevos no amplían lo que la cuenta puede cambiar.** Son de solo lectura (ningún permiso `set*`, `create*`, `update*` ni `delete*`), no dan acceso a documentos de Firestore ni a cuentas de usuario, y el segundo no incluye `artifactregistry.repositories.downloadArtifacts` ni `storage.objects.*`. El riesgo importante de la cuenta es anterior a este cambio y ya estaba aceptado (ver MED-001).

Fuera del alcance directo y no verificado: el código de aplicación, las reglas de Firestore y la cuenta del agente.

---

## Hallazgos

### [MED-001] `terraform-production` puede reescribir la federación y las vinculaciones de cuentas de servicio
| Campo | Valor |
|---|---|
| **Severidad** | Media (riesgo residual aceptado; **no lo introduce este cambio**) |
| **Categoría** | CIS GCP 1.x (privilegios IAM) / OWASP CI-CD-SEC-5 (control de flujo insuficiente) |
| **Componente afectado** | `terraform-production`, raíz `infra/platform/`, *environment* `infra-production` |

**Descripción**
El `apply` de `main` ejecuta con `terraform-production` el código Terraform que esté en `main`. Esa cuenta tiene `iam.workloadIdentityPoolAdmin` (puede cambiar la condición del proveedor y quién se federa) e `iam.serviceAccountAdmin` (puede modificar la política de las cuentas de servicio, incluidas `terraform-*` y `deployer-*`). Código Terraform malicioso o erróneo fusionado en `main` y aprobado podría ampliar quién obtiene credenciales de esas cuentas. Es el vector ya descrito en MED-003 de la Fase 1; la concesión de este cambio no lo agrava, pero ahora el `apply` de `platform` sí se ejecuta de verdad con esa cuenta.

**Evidencia**
- Roles de la cuenta (MCP, 2026-10-16): `workloadIdentityPoolAdmin`, `serviceAccountAdmin`, `artifactregistry.admin`, `run.admin`, `serviceUsageAdmin`, `projectIamAdmin` condicionado (`iam.googleapis.com/modifiedGrantsByRole` solo `roles/datastore.user`), `mytasksEnvironmentAdmin` y los dos de lectura nuevos.
- Controles que lo acotan, verificados: *environment* `infra-production` con revisor obligatorio, `can_admins_bypass: false` y política de ramas personalizada (API pública de GitHub); el *digest* del plan aprobado debe coincidir con el aplicado (`infra-plan.sh`, salida 3).

**Remediación requerida**
Mantener el riesgo aceptado, pero cerrar la detección: alerta por correo ante `SetIamPolicy` sobre cuentas de servicio y sobre el proveedor de federación cuando el autor no sea una ejecución de `infra-production` (pendiente desde LOW-001 de la Fase 3). Documentar en el RUNBOOK que quien revisa el plan de `platform` debe leer también los cambios de IAM, no solo los recursos nuevos.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-operator` (alerta, con confirmación del propietario) y `mytasks-iac-developer` (definición de la alerta como código)
- Tipo de cambio: De configuración

---

### [LOW-001] La anotación `::error::` publica el final de un plan fallido en un repositorio público
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A09 (registro) / exposición de información |
| **Componente afectado** | `.github/scripts/infra-plan.sh` (líneas del `echo "::error::…"`) |

**Descripción**
Un plan fallido deja sus últimas 15 líneas como anotación del check, visibles sin iniciar sesión en un repositorio público. Terraform enmascara los valores sensibles de los recursos, pero un mensaje de error de una API puede incluir identificadores (números de proyecto, correos de cuentas de servicio). Esos mismos datos ya se publican en el resumen del job (investigación R8 de `research.md`), así que el riesgo añadido es pequeño. No hay inyección de comandos: los saltos de línea se codifican como `%0A`, de modo que una línea de la salida no puede iniciar otro comando de flujo de trabajo. Solo corre en PR del mismo repositorio, nunca en forks.

**Evidencia**
- `infra-plan.sh`: rama `result="failed"`, `tail -n 15 "$out" | awk 'BEGIN { ORS = "%0A" } { print }'`.
- Test que cubre el comportamiento: `test-infra-plan.sh`, caso «a failed plan leaves the cause as an annotation».

**Remediación requerida**
Aceptar el riesgo. Si en algún momento un mensaje de error mostrara un secreto, reducir las líneas o filtrar por `Error:`. No hace falta cambiar nada ahora.

**Destinatario**
- Skill/agente: ninguno de `CLAUDE.md` cubre GitHub Actions; decide el propietario
- Tipo de cambio: De implementación (solo si se decide endurecer)

---

### [LOW-002] Documentación de permisos incompleta tras la concesión
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | Gobierno de IAM (trazabilidad) |
| **Componente afectado** | `infra/iam/roles/plan-reader.yaml`, `infra/RUNBOOK.md` |

**Descripción**
La cabecera de `platform-plan-reader.yaml` ya dice que `terraform-production` también recibe el rol, pero `plan-reader.yaml` sigue diciendo que se concede solo a `terraform-plan-<env>`, y el inventario de permisos del RUNBOOK no recoge la concesión del 2026-10-16. Un revisor futuro podría tomar esa concesión por un error.

**Evidencia**
- `plan-reader.yaml`, líneas 1 a 3: «Granted by the owner to terraform-plan-<env>».
- `terraform-production` figura con ambos roles en la política del proyecto (MCP, 2026-10-16).

**Remediación requerida**
Actualizar la cabecera de `plan-reader.yaml` y añadir al RUNBOOK la fila de las dos concesiones, con fecha y motivo (aplicar `platform`).

**Estado: corregido** en la misma PR que este informe (cabecera de `plan-reader.yaml` y párrafo de roles del RUNBOOK).

**Destinatario**
- Skill/agente: `mytasks-iac-developer`
- Tipo de cambio: De configuración (documentación)

---

## Observaciones sin hallazgo

- **`prevent_self_review: false` en `infra-production`.** El propietario es el único revisor y el único usuario, así que no hay otro a quien exigírselo. Es coherente con el LOW-001 de la Fase 5 y queda como riesgo aceptado: la protección real es el revisor obligatorio y que no hay *bypass* de administradores.
- **`apikeys.keys.getKeyString` en `mytasksPlanReader`.** Permite leer la clave de API web. Es una clave de navegador restringida por referente y por API, y se publica en `/config.js`; no es un secreto. `terraform-production` ya la tenía por `mytasksEnvironmentAdmin`.
- **Registro y detección (categoría 6):** la auditoría de acceso a datos de Firestore e IAM está definida en `platform`. No se ha verificado si existe alerta sobre `SetIamPolicy`; ver MED-001.
- **Gestión de incidentes (categoría 7) y dependencias (categoría 4):** información insuficiente para esta revisión; no se han analizado.

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| MED-001 | Media (residual) | Operador y desarrollador IaC | `mytasks-google-cloud-operator`, `mytasks-iac-developer` |
| LOW-001 | Baja | Propietario (ningún skill cubre Actions) | — |
| LOW-002 | Baja | Desarrollador IaC | `mytasks-iac-developer` |
