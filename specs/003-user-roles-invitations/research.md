# Research: Perfilado mínimo de usuarios e invitaciones

Resuelve las decisiones que la spec dejó para el plan. No quedan `NEEDS CLARIFICATION`.

## R1. Dónde se decide quién puede entrar

- **Decision**: en el backend, contra Firestore. Cada petición de datos exige que exista
  `users/{uid}` con estado `active`; si no, responde 403 `access_denied`.
- **Rationale**: es el único punto por el que pasan todos los datos (las reglas de Firestore
  deniegan el acceso directo), no añade servicios ni permisos y permite revocar al instante.
- **Alternatives considered**:
  - *Funciones de bloqueo de Identity Platform* (`beforeSignIn`/`beforeCreate`): servicio nuevo
    (Cloud Functions), mejora de Identity Platform y más IAM; rechazado por el Principio I.
  - *Claims personalizados en el token*: exigen que la cuenta de servicio de la API gestione
    usuarios de Auth (rol `firebaseauth.*`, que el hallazgo MED-001 de `security-review-t046.md`
    pidió evitar) y la revocación no es inmediata.
  - *Desactivar el alta en Identity Platform*: impediría que un invitado cree su identidad
    Google la primera vez salvo que la API la cree antes con permisos de Auth; mismo problema.

## R2. Revocación inmediata frente a la caducidad del token

- **Decision**: no usar `check_revoked` ni revocar tokens de Auth; el estado `revoked` de
  `users/{uid}` se lee en cada petición, así que surte efecto en la siguiente.
- **Rationale**: cumple SC-003 (< 5 min) con una lectura de Firestore por petición, mucho más
  barata que `check_revoked` (llamada a Auth) y sin permisos nuevos. Hace innecesario el riesgo
  aceptado LOW-004 para el acceso a datos.
- **Alternatives considered**: caché local del estado con TTL corto (rechazada: complejidad
  sin necesidad medida; se revisa si `test_performance.py` falla).

## R3. Aceptación de la invitación

- **Decision**: `GET /api/v1/me` es el único punto que crea cuentas. Con el token verificado
  y `email_verified = true`:
  1. si existe `users/{uid}` → devuelve la cuenta (403 si está revocada);
  2. si no existe y hay `invitations/{correo}` pendiente → en una transacción crea la cuenta
     con rol `user` y marca la invitación aceptada;
  3. si no existe y el correo coincide con `BOOTSTRAP_ADMIN_EMAIL` → crea la cuenta `admin`;
  4. en cualquier otro caso → 403 `access_denied` sin crear nada.
- **Rationale**: los endpoints de tareas nunca tienen efectos de alta (FR-001); la
  transacción garantiza que una invitación se acepta una sola vez (FR-007) aunque haya dos
  inicios de sesión simultáneos.
- **Alternatives considered**: aceptar en cualquier endpoint (efectos laterales ocultos en una
  dependencia, más difícil de probar).

## R4. Identificación de la invitación

- **Decision**: el id del documento es el correo normalizado (minúsculas, sin espacios), y la
  cuenta guarda el mismo correo normalizado. Se exige `email_verified` para que un correo
  sin verificar no pueda aceptar una invitación ajena.
- **Rationale**: unicidad por correo gratis (sin consultas ni índices) y es lo que el
  administrador conoce; el `uid` solo existe cuando la persona ya ha iniciado sesión.
- **Alternatives considered**: invitar por `uid` (el administrador no puede conocerlo de
  antemano); código/enlace de un solo uso (descartado por el supuesto "sin envío de correo").
- **Riesgo residual** (para `mytasks-security-auditor`): si una cuenta Google cambia de correo,
  la cuenta de la aplicación sigue ligada al `uid`, no al correo. *(Corrección de la Fase 4:
  este texto decía que el correo guardado se actualizaba desde el token en `/me`; la
  implementación no lo hace, el correo queda el de la creación de la cuenta.)*

## R5. Primer administrador

- **Decision**: variable `BOOTSTRAP_ADMIN_EMAIL` por entorno, como *variable* (no secreto) de
  cada GitHub Environment (`staging`, `production`); `deploy.yml` la añade con
  `--update-env-vars` junto a `APP_VERSION`. Solo actúa si no existe `users/{uid}`.
- **Rationale**: funciona antes de que el propietario inicie sesión por primera vez (el `uid`
  aún no existe) y no requiere permisos IAM ni operaciones manuales sobre Google Cloud. La
  cuenta existente del propietario conserva sus tareas porque el `uid` no cambia.
- **Alternatives considered**:
  - *Variable en Terraform*: el módulo ignora `env` de los servicios Cloud Run
    (`cloud_run.tf`, `ignore_changes`), así que no llegaría a servicios ya creados.
  - *Documento semilla por Terraform*: requiere conocer el `uid` de cada entorno y permisos de
    Firestore para la cuenta de Terraform.
  - *«El primero que entre es admin»*: permite que un desconocido se adueñe del sistema.
- **Efecto**: `deploy.yml` debe comprobar que la variable existe (su paso "Check the service
  variables") para no desplegar un entorno sin administrador posible.

## R6. Administradores y último administrador (FR-012)

- **Decision**: no hay operaciones para crear, degradar ni revocar administradores; la API
  rechaza revocar una cuenta con rol `admin`. Así nunca se pierde el último administrador.
- **Rationale**: satisface FR-012 sin contar administradores ni transacciones; es coherente con
  el supuesto "promover a admin queda fuera de alcance".

## R7. Reactivación (aclaración de la sesión 2026-10-22)

- **Decision**: invitar un correo con cuenta `revoked` pone la cuenta en `active` con rol
  `user`, sin tocar sus tareas; no se crea invitación. Invitar un correo con cuenta `active`
  responde 409 con su estado; una invitación `pending` existente responde 200 sin duplicar.
  Una invitación `revoked` puede volver a `pending` invitando de nuevo.

## R8. Auditoría (FR-015, FR-017)

- **Decision**: eventos `log_event` nuevos: `invitation_created`, `invitation_accepted`,
  `invitation_revoked`, `access_revoked`, `access_reactivated`, `access_denied`. Campos nuevos
  en la lista cerrada: `actor_uid` y `target` (hash SHA-256 truncado del correo, para no
  registrar correos en claro). `access_denied` registra solo la causa.
- **Mensajes de denegación**: idénticos para "sin invitación" y "revocado"
  (`access_denied`), para no revelar el estado de un correo (FR-017).

## R9. Frontend

- **Decision**: tras iniciar sesión, `useAccount` (TanStack Query) llama a `/me`. 403 →
  `AccessDeniedPage` con cierre de sesión; 200 → rutas normales; el rol `admin` habilita el
  enlace y la ruta `/admin/access`. El rol de la interfaz es solo comodidad: el servidor decide
  (FR-008). Sin Zustand: el rol viene de la consulta, no de estado cliente propio.

## R10. Pruebas existentes

- **Decision**: la fixture `google_user` de `conftest.py` crea por defecto la cuenta activa
  `users/{uid}`; las pruebas de acceso usan una variante sin cuenta. Así las ~20 pruebas de
  integración de tareas siguen valiendo y se añade una prueba parametrizada que comprueba que
  **cada** endpoint de tareas devuelve 403 sin cuenta y con cuenta revocada (SC-004).
