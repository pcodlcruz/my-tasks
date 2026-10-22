# Data Model: Perfilado mínimo de usuarios e invitaciones

Modelo en Firestore. Las reglas de seguridad de Firestore siguen denegando todo acceso de
cliente: solo la API lee y escribe estas colecciones.

## Cuenta de usuario — `users/{uid}`

Documento padre de las tareas (`users/{uid}/tasks/{taskId}`, sin cambios). Hasta ahora no
existía como documento; se crea al aceptar una invitación o con el bootstrap.

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | Normalizado (minúsculas, sin espacios). Se actualiza desde el token en `/me`. |
| `role` | `"user"` \| `"admin"` | Se fija al crear; no hay operación que lo cambie. |
| `status` | `"active"` \| `"revoked"` | `revoked` deniega el acceso a datos; las tareas se conservan. |
| `created_at` | timestamp | Alta de la cuenta. |
| `revoked_at` | timestamp \| null | Última revocación; se limpia al reactivar. |

**Transiciones**: `active → revoked` (admin, solo si `role = user`) y `revoked → active`
(admin, volviendo a invitar el correo). Un `admin` no puede pasar a `revoked` (R6).

**Unicidad**: un `uid` ↔ una cuenta. El correo es único entre cuentas (se consulta por
`email` al reinvitar; índice de campo único automático).

## Invitación — `invitations/{correo}`

El id del documento es el correo normalizado.

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | Igual que el id. Formato validado en la entrada. |
| `status` | `"pending"` \| `"accepted"` \| `"revoked"` | Ver transiciones. |
| `invited_by` | string | `uid` del administrador que la creó. |
| `created_at` | timestamp | |
| `accepted_at` | timestamp \| null | Se rellena al aceptarse. |
| `accepted_uid` | string \| null | `uid` de la cuenta creada. |

**Transiciones**: `pending → accepted` (la persona inicia sesión; transacción única),
`pending → revoked` (admin), `revoked → pending` (admin reinvita). `accepted` es final: para
quitar el acceso se revoca la **cuenta**, no la invitación.

## Relaciones

```text
Invitación (correo) --acepta--> Cuenta (uid) --posee--> Tareas (users/{uid}/tasks/*)
```

## Validación (en el límite del sistema, Pydantic)

- Correo: formato válido, máximo 254 caracteres, sin `/`, normalizado a minúsculas.
- `role` y `status` son enumerados cerrados; la entrada del cliente nunca los fija.
- El `uid` y el rol salen siempre del servidor, nunca de la petición.

## Migración

Ninguna. La cuenta del propietario obtiene su `users/{uid}` en su primer `/me` tras el
despliegue mediante el bootstrap; sus tareas siguen en la misma ruta.
