# Informe de Auditoría de Seguridad — Feature 004 (perfil y preferencias), revisión final

**Fecha**: 2026-10-25 · **Rama**: `feature/004-user-profile-settings-fase-7` (sobre `develop` con las Fases 1–6 fusionadas)
**Skill**: `mytasks-security-auditor` · **Tarea**: T105
**Tipología detectada**: aplicación web (React) + API REST (FastAPI) + cloud-native/GCP (Firestore, Cloud Run, contenedor web nginx)
**Marcos aplicados**: OWASP Top 10, OWASP API Security Top 10, CIS Google Cloud Foundation Benchmark (solo en lo que toca: la feature no cambia infraestructura)
**Nivel de riesgo global**: **Bajo**

---

## Resumen ejecutivo

Esta revisión cierra la feature: consolida los informes de las Fases 2, 3 y 6 (las Fases 1, 4 y 5 no tuvieron informe propio: la 1 es solo diseño, y las 4 y 5 no tocan autenticación, autorización ni el modelo de datos más allá de lo ya revisado), comprueba el estado actual de cada hallazgo contra el código y revisa la documentación nueva (T102–T104).

- **Sin hallazgos críticos, altos ni medios abiertos.** Los tres medios de la feature (MED-001 de la Fase 2, MED-001 y MED-002 de la Fase 6) se corrigieron en su PR y siguen corregidos.
- **Cuatro bajos abiertos** y **uno cerrado**. Ninguno bloquea la salida a producción. Dos están bajo decisión del propietario como riesgo aceptado o backlog; dos son mejoras de robustez.
- **No hay hallazgos nuevos** en esta revisión final. La documentación (README, RUNBOOK, contrato) no introduce información sensible ni contradice lo implementado.
- **Recomendación**: la feature puede pasar a staging. Quedan dos comprobaciones que solo puede hacer el propietario con el entorno real (T107): ausencia de errores de CSP en la consola con `blob:` y el borrado manual de un avatar descrito en el RUNBOOK (procedimiento no probado).

---

## Qué se revisó y con qué resultado

| Área | Resultado | Evidencia |
|---|---|---|
| Autenticación y autorización | ✅ | Todos los endpoints de `/api/v1/me/profile` y `/api/v1/me/avatar` usan `Depends(get_active_user)`; el `uid` sale del token y ninguna ruta, consulta ni cabecera acepta otro (`test_profile_isolation.py`). Una cuenta revocada recibe 403. |
| Acceso directo a datos | ✅ | `firestore.rules` deniega todo (`allow read, write: if false`): los documentos `settings/profile` y `settings/avatar` solo son accesibles por la API. |
| Entrada de archivos (avatar) | ✅ | Identificación por contenido, tope de 2 MB (por `Content-Length` y cortando la lectura), tope de 12 Mpx antes de decodificar, 2 procesados a la vez, reprocesado a WebP 256×256 sin metadatos; el servidor nunca guarda lo recibido. |
| Servido de la imagen | ✅ | `image/webp` fijo, `nosniff`, `Cache-Control: private, max-age=31536000, immutable` y `Vary: Authorization` (`routers/profile.py`); corrige la caché compartida entre cuentas (MED-001 de la Fase 6). |
| Exposición de datos en registros | ✅ | `avatar_uploaded` registra solo `uid` y `size`; `avatar_removed`, solo `uid` (`services/profile_service.py`). Probado en `test_audit_logging.py`. |
| CSP del contenedor web | ✅ | Solo cambia `img-src` (`'self' data: blob:`); `40-runtime-config.sh` y el test de nginx comprueban la política completa. No se admite ningún origen remoto de imágenes. |
| Inyección en el cliente | ✅ | No hay `dangerouslySetInnerHTML` ni `innerHTML` en `frontend/src`: el nombre para mostrar se pinta como texto (cierra LOW-002 de la Fase 2). |
| Cadena de suministro | ✅ | Única dependencia nueva: `pillow` 13.0.0, fijada con *hashes* en `backend/uv.lock`; la imagen del backend se construyó en el CI (`images-build` en verde en la PR #62). No se ejecutó un escáner de CVE en esta sesión: ver «Alcance». |
| Infraestructura / IAM | ✅ | Sin cambios en `infra/`, sin buckets, sin cuentas de servicio ni roles nuevos. |
| Documentación (T102–T104) | ✅ | El contrato integrado (v1.3.0) coincide con `GET /openapi.json` en rutas, métodos, parámetros, esquemas y referencias; README y RUNBOOK no contienen secretos ni valores de entorno; los procedimientos manuales del RUNBOOK están marcados como no probados. |

---

## Estado acumulado de los hallazgos

| ID (informe) | Severidad | Estado a 2026-10-25 |
|---|---|---|
| MED-001 (Fase 2) — transacción de avatar sin reintento | Media | **Corregido** en la PR #58; sigue cubierto por `test_profile_repository_retry.py` |
| MED-001 (Fase 6) — caché de imagen compartida entre cuentas | Media | **Corregido** en la PR #62 (`Vary: Authorization`) |
| MED-002 (Fase 6) — memoria al decodificar | Media | **Corregido** en la PR #62 (12 Mpx, 2 procesados a la vez) |
| LOW-002 (Fase 2) — nombre escapado en el cliente | Baja | **Cerrado**: se pinta como texto y no hay `innerHTML` (ver tabla) |
| LOW-001 (Fase 2) — sin límite de frecuencia en `PATCH`/`DELETE /me/profile` | Baja | Abierto, backlog (decisión del propietario) |
| LOW-003 (Fase 2) — perfil leído sin revalidar `display_name` y `avatar_preset` | Baja | Abierto, backlog |
| LOW-001 (Fase 3) — `theme-init.js` sin regla propia en nginx | Baja | Abierto, backlog |
| LOW-002 (Fase 3) — caché de apariencia sobrevive al cierre de sesión | Baja | Riesgo aceptado (R8) |
| LOW-001 (Fase 6) — archivos rechazados no cuentan para el límite | Baja | Abierto, backlog (decisión del propietario) |
| LOW-002 (Fase 6) — sin límite global en `GET /me/avatar` | Baja | Abierto, backlog (decisión del propietario) |

(Son cuatro bajos «de backlog» más los dos aceptados o a decisión del propietario: ninguno cambia de severidad por la suma de los demás.)

---

## Riesgo residual

### [LOW-A] El tema y la densidad quedan en `localStorage` en equipos compartidos
| Campo | Valor |
|---|---|
| **Severidad** | Baja (riesgo aceptado, `research.md` R8) |
| **Categoría** | OWASP A04: Insecure Design (privacidad en equipos compartidos) |
| **Componente afectado** | `frontend/src/lib/appearance.ts`, `frontend/public/theme-init.js` |

**Descripción**
`mytasks.appearance` guarda dos cadenas de una lista cerrada (tema y densidad) y no se borra al cerrar sesión: es lo que permite pintar el login con el último tema, sin destello. En un ordenador compartido, la persona siguiente ve el aspecto de la anterior en la pantalla de inicio de sesión.

**Evidencia**
`appearance.ts` solo escribe y lee la clave; `SessionCacheReset` vacía TanStack Query y los `blob:` URL del avatar, pero no esa clave. Lo leído se valida contra la lista cerrada y un valor ajeno se ignora (`readCachedAppearance`).

**Qué sí queda protegido**
La imagen del avatar **no** sobrevive al cierre de sesión: se descarga con el token, vive en memoria como `blob:` URL y se revoca al cerrar sesión o cambiar de persona. El nombre para mostrar tampoco se guarda en el navegador. Con `Vary: Authorization` el navegador no sirve la imagen en caché a otra cuenta.

**Remediación requerida**
Ninguna obligatoria. Si el propietario cambia de criterio, borrar la clave al detectar el cierre de sesión (a costa de que el login vuelva a pintarse con el tema del sistema).

**Destinatario**
- Skill/agente: `mytasks-frontend-developer` (solo si el propietario lo decide)
- Tipo de cambio: De implementación

### [LOW-B] Dos hallazgos de robustez que siguen sin corregirse (LOW-003 de la Fase 2 y LOW-001 de la Fase 3)
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API8 / A05: Security Misconfiguration (robustez) |
| **Componente afectado** | `domain/profile.py::profile_from_document`; `frontend/nginx/default.conf` |

**Descripción**
(1) Al leer el perfil, los enumerados inválidos se sustituyen por su valor por defecto, pero `display_name` y `avatar_preset` se devuelven tal cual están guardados y la sustitución no deja rastro en los registros. Hoy solo escribe la API, así que no es explotable; importaría si alguien edita Firestore a mano, y el RUNBOOK nuevo describe precisamente un procedimiento manual sobre estos documentos. (2) `theme-init.js` se sirve por `location /`, cuya regla `try_files $uri /index.html` devolvería HTML con un 200 si el fichero faltara de la imagen: sin ejecución de código (`nosniff`), pero el fallo pasaría inadvertido.

**Evidencia**
`profile_from_document` aplica `_enum_or_default` solo a los enumerados (líneas 180–189) y no usa `normalize_display_name` ni el catálogo; `frontend/nginx/default.conf` no menciona `theme-init.js`.

**Remediación requerida**
(1) Revalidar nombre y preset al leer y registrar un evento (solo `uid` y nombre del campo) cuando se sustituya un valor. (2) Añadir `location = /theme-init.js` con `try_files $uri =404`, cabecera de seguridad y `Cache-Control: no-cache`, y ampliar el test de nginx. Ambos, a criterio del propietario; ninguno es necesario para el release.

**Destinatario**
- (1) `mytasks-backend-developer` · De implementación
- (2) `mytasks-frontend-developer` · De configuración

---

## Alcance y límites de esta revisión

- **Qué no se pudo hacer**: no se ejecutó un escáner de vulnerabilidades de dependencias (no hay acceso a bases de CVE desde la sesión) ni pruebas de carga sobre el límite de 12 Mpx / 2 procesados con instancias reales de Cloud Run. Pillow 13.0.0 está fijada, pero conviene que el propietario compruebe sus avisos de seguridad antes del release.
- **Fuera de alcance**: la recuperación del administrador de la feature 003 (riesgo aceptado el 2026-10-23, ver `feature-003`) y la configuración de Firebase Authentication, que no cambian con esta feature.
- **Pendiente en el entorno real (T107, propietario)**: ausencia de errores de CSP al ver el avatar en staging, y el escenario de límite de subidas con cuentas reales.

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente | Estado |
|---|---|---|---|---|
| LOW-A | Baja | Desarrollador frontend | `mytasks-frontend-developer` | Riesgo aceptado (R8) |
| LOW-B (1) | Baja | Desarrollador backend | `mytasks-backend-developer` | Backlog |
| LOW-B (2) | Baja | Desarrollador frontend | `mytasks-frontend-developer` | Backlog |
| LOW-001/003 (F2), LOW-001/002 (F6) | Baja | Desarrollador backend | `mytasks-backend-developer` | Backlog, decisión del propietario |
