# Informe de Auditoría de Seguridad — Feature 003, Fase 3: pantalla de administración

**Fecha**: 2026-10-23
**Rama revisada**: `feature/003-user-roles-invitations-fase-3` (sin commitear en el momento de la revisión)
**Alcance**: tareas T043–T051 y el tope de invitaciones pendientes (T059–T062, backend). Frontend: `features/admin/AccessPage.tsx`, `app/AdminRoute.tsx`, `features/auth/useIsAdmin.ts`, `app/AppHeader.tsx`, `app/App.tsx`, `api/access.ts`, `api/types.ts`, `lib/apiClient.ts`. Backend: recuento de pendientes en `_upsert_pending_invitation`, error 409 `invitation_limit_reached`.
**Tipología detectada**: aplicación web (React, SPA servida por nginx) + API REST (FastAPI) + cloud-native/GCP (Firestore, Cloud Run).
**Marcos aplicados**: OWASP Top 10 (A01, A04, A05, A09), OWASP ASVS (V3 sesión, V4 control de acceso, V14 configuración), OWASP API Security Top 10 (API1, API4, API5).
**Nivel de riesgo global**: **Bajo**

---

## Resumen ejecutivo

El rol en la interfaz es, como se pretendía, **solo cosmético**: ocultar el enlace «Accesos» y redirigir desde `/admin/access` mejora la experiencia, pero no concede nada; las cuatro llamadas de administración las vuelve a autorizar el servidor con `require_admin`. La fase no añade almacenamiento en el navegador, ni `dangerouslySetInnerHTML`, ni orígenes nuevos a la CSP, ni dependencias, y no toca nginx ni la infraestructura.

No hay hallazgos críticos, altos ni medios; **nada bloquea la fusión**. Hay **dos hallazgos bajos**: la caché de datos del cliente no se vacía al cerrar sesión (heredado de la feature 001, ahora con más datos sensibles), y el hallazgo MED-001 de la Fase 2 queda **solo parcialmente resuelto** por el tope de 50. Hay además dos observaciones informativas.

---

## Controles verificados

Comprobados leyendo el código y ejecutando las pruebas (387 de backend, 113 unitarias de frontend y 36 e2e en verde, con `ruff`, `mypy`, `eslint`, `tsc` y `prettier` limpios).

| Control | Evidencia |
|---|---|
| **El rol de la interfaz no concede nada** | `useIsAdmin` solo decide qué se pinta. `listAccess`, `createInvitation`, `revokeInvitation` y `revokeUserAccess` llaman a `/api/v1/admin/*`, donde `require_admin` lee el rol de la cuenta en cada petición (Fase 2). Un `user` que fuerce la URL recibe 403; el e2e `un user no ve la administración…` comprueba la redirección. |
| **Sin datos sensibles en almacenamiento del navegador** | `grep` de `localStorage`, `sessionStorage`, `console.` y `dangerouslySetInnerHTML` en `frontend/src`: sin resultados. La lista de accesos vive solo en la caché en memoria de TanStack Query. |
| **Sin inyección en la interfaz** | Correos y mensajes del servidor se pintan como texto de React (escapado); ninguno entra en HTML ni en atributos de URL. |
| **Correos codificados en la URL** | `revokeInvitation` y `revokeUserAccess` usan `encodeURIComponent` en el segmento de ruta; el servidor además rechaza `/` y espacios en el correo y valida el `uid` con una lista blanca. |
| **Validación en el cliente no sustituye a la del servidor** | `AccessPage` aplica la misma regla de forma (≤ 254, sin espacios ni `/`), pero el servidor valida de nuevo y responde 422; el cliente trata ese 422 con el mismo mensaje. |
| **Mensajes de error acotados** | Solo se muestran tal cual los códigos de una lista cerrada (`already_active`, `invitation_limit_reached`, `admin_protected`, …); cualquier otro error muestra un texto genérico, sin detalle interno. |
| **CSP y cabeceras sin cambios** | `git diff origin/develop -- frontend/nginx infra frontend/package*.json` vacío. La CSP vigente (`40-runtime-config.sh`) mantiene `script-src 'self' https://apis.google.com`, sin `unsafe-inline`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff` y `Referrer-Policy: no-referrer`; la fase no añade orígenes ni estilos o scripts en línea. |
| **Revocar a un administrador no es posible desde la UI** | El botón «Retirar acceso» solo se pinta para `role === 'user'` con cuenta activa; el servidor además lo rechaza (409 `admin_protected`) y el e2e comprueba que la fila del administrador no tiene botones. |
| **Confirmación antes de acciones destructivas** | Ambas revocaciones pasan por `ConfirmDialog` (foco inicial en «Cancelar», Escape cierra). |
| **Tope de invitaciones pendientes** | El recuento ocurre dentro de la transacción que crea la invitación; `test_two_invitations_at_once_with_one_slot_left_create_only_one` comprueba que, con un hueco, de dos peticiones simultáneas gana una (201) y la otra recibe 409, y nunca hay más de 50. Reinvitar a un pendiente y reactivar no consumen hueco. |

---

## Hallazgos

### [LOW-001] La caché de datos del cliente no se vacía al cerrar sesión ni al cambiar de usuario
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A01: Broken Access Control / ASVS V3.3 (cierre de sesión) |
| **Componente afectado** | `app/App.tsx` (`QueryClient` de módulo), `features/auth/useSession.ts` (`signOut`), claves `['tasks', …]` y `['admin', 'access']` |

**Descripción**
El `QueryClient` se crea una vez por carga de página y nunca se vacía. Las claves de las tareas y de la lista de accesos no incluyen el `uid`. Si una persona cierra sesión y otra inicia sesión en la misma pestaña sin recargar, la segunda hereda en memoria lo que la primera tenía en caché: el tablero, el historial y la papelera de la primera se pintan al instante (con datos obsoletos) hasta que termina la nueva petición, y la lista de correos de invitaciones y cuentas del administrador sigue en memoria. Solo `useAccount` se protegió con el `uid` en su clave. Es heredado de la feature 001, pero esta fase añade datos de terceros (correos) a lo que queda en memoria.

**Evidencia**
`App.tsx`: `const queryClient = new QueryClient()` a nivel de módulo. `grep` de `clear()`, `removeQueries` y `resetQueries` en `frontend/src`: sin resultados. `useSession.ts::signOut` solo llama a `firebaseSignOut(auth)`. Mitigantes: la pantalla de administración exige `useIsAdmin` (un `user` nunca la pinta) y `ProtectedRoute` muestra la pantalla «sin acceso» a una cuenta denegada antes de pintar nada; el efecto exige un navegador compartido y no recargar entre ambas sesiones.

**Remediación requerida**
Vaciar la caché de consultas en el momento en que cambia la identidad (al cerrar sesión y cuando cambia el `uid`), o incluir el `uid` en las claves de consulta; en cualquier caso con una prueba que compruebe que tras un cambio de usuario no se muestran datos del anterior.

**Destinatario**
- Skill/agente: `mytasks-frontend-developer`
- Tipo de cambio: De implementación

---

### [LOW-002] El tope de 50 no garantiza que las invitaciones pendientes sean visibles (MED-001 sigue abierto en parte)
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption / A04: Insecure Design |
| **Componente afectado** | `AccessService.list_access`, `AccountRepository.list_invitations` / `list_accounts`, comentario de `MAX_PENDING_INVITATIONS` |

**Descripción**
El tope limita las invitaciones *pendientes*, pero la lista de invitaciones sigue siendo «las 100 más recientes de cualquier estado». Una invitación pendiente queda fuera de la lista en cuanto haya 100 o más invitaciones posteriores aceptadas o revocadas, y el histórico de invitaciones no tiene tope: invitar y revocar direcciones distintas lo hace crecer sin límite. Lo mismo ocurre con las cuentas: más de 100 dejan fuera a las más antiguas, que ya no se pueden revocar desde la interfaz. El riesgo real es bajo (hace falta un administrador, o su sesión comprometida, y el único acceso que se puede ocultar así es el de un `user`), pero la interfaz ya avisa «Se muestran las 100 más recientes» y el comentario que acompaña a la constante en `access_service.py` afirma que *las pendientes siempre caben en esa lista*, lo cual no es cierto.

**Evidencia**
`access_service.py`: `ACCESS_LIST_LIMIT = 100` y el comentario de `MAX_PENDING_INVITATIONS = 50` («so the pending ones always fit in that list»). `account_repository.py::list_invitations`: `order_by("created_at", DESCENDING).limit(limit)` sin filtro de estado. `_upsert_pending_invitation`: una invitación revocada se reutiliza solo para la misma dirección; las direcciones nuevas añaden documentos.

**Remediación requerida**
Elegir: (a) listar siempre *todas* las pendientes (a lo sumo 50) y las cuentas activas, limitando solo el histórico, o (b) paginar por cursor. En cualquier caso, corregir el comentario de la constante para que no prometa lo que no cumple.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (decisión previa del propietario sobre el alcance)
- Tipo de cambio: De implementación

---

## Observaciones informativas

### [INFO-001] El correo sigue viajando en la ruta de `DELETE /admin/invitations/{email}`
Arrastra el LOW-003 de la Fase 2: la interfaz lo codifica correctamente, pero el correo completo queda en los registros de petición de Cloud Run. Sin cambios en esta fase; la decisión (aceptar o cambiar el contrato) sigue siendo del propietario.

### [INFO-002] La nueva pantalla no tiene prueba de accesibilidad automatizada
Los formularios y diálogos usan etiquetas, `role="alert"`, `aria-invalid`/`aria-describedby` y nombres accesibles por fila, y hay pruebas unitarias de teclado, pero `a11y.spec.ts` (axe) no cubre `/admin/access`. No es un fallo de seguridad; se anota por coherencia con el resto de pantallas. *Destinatario*: `mytasks-frontend-developer`.

---

## Categorías sin información suficiente

- **Seguridad de red y perímetro**, **configuración de Identity Platform** y **gestión de incidentes**: sin cambios en esta fase; siguen vigentes las observaciones de las Fases 1 y 2 (incluida la recuperación del acceso de administrador, T053).

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| LOW-001 | Baja | Desarrollador frontend | `mytasks-frontend-developer` |
| LOW-002 | Baja | Desarrollador backend (tras decisión del propietario) | `mytasks-backend-developer` |
| INFO-001 | Informativa | Propietario / desarrollador backend | `mytasks-backend-developer` |
| INFO-002 | Informativa | Desarrollador frontend | `mytasks-frontend-developer` |

## Recomendación

Sin hallazgos que bloqueen la fusión de la Fase 3. LOW-001 es barato de corregir y conviene hacerlo antes del release; LOW-002 y las observaciones pueden ir al backlog técnico.
