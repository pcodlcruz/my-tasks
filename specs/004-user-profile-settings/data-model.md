# Modelo de datos: Perfil de usuario y preferencias

**Feature**: `004-user-profile-settings` | **Fecha**: 2026-10-23 | **Plan**: [plan.md](plan.md)

> **Ampliado por la feature 007** ([data-model](../007-daily-progress-arcade/data-model.md)): el
> documento `settings/profile` gana cinco campos (`daily_goal`, `active_weekdays`, `timezone`,
> `morning_review` y `arcade_mode`), con sus valores por defecto cuando faltan, y `ProfileOut` y
> `ProfileUpdateIn` los exponen (contrato 1.4.0). `DELETE /api/v1/me/profile` no los restablece. No
> cambia ningún campo de los de esta feature ni se migra nada.

Dos documentos nuevos por persona, en una subcolección `settings` de su documento de cuenta
`users/{uid}` (feature 003). No cambia ningún documento existente ni se migra nada: sin
documento, el comportamiento es el de los valores por defecto (FR-004, SC-009).

```text
users/{uid}                      ← cuenta (feature 003): no se toca
├── tasks/{taskId}               ← tareas (feature 001): no se tocan
└── settings/
    ├── profile                  ← Preferencias de perfil (este documento)
    └── avatar                   ← Imagen de avatar subida (solo si existe)
```

Solo el backend (cuenta de servicio de la API) lee y escribe estos documentos. El cliente nunca
accede a Firestore. El `uid` sale siempre del token verificado, jamás de la petición.

## `users/{uid}/settings/profile` — Preferencias de perfil

El documento se crea al primer cambio (`set` con `merge`). Un campo ausente equivale a su valor
por defecto, así que el backend nunca devuelve «sin perfil»: devuelve los valores por defecto.

| Campo | Tipo | Valores | Por defecto | Notas |
|---|---|---|---|---|
| `theme` | cadena | `light`, `dark`, `system` | `system` | FR-006 |
| `density` | cadena | `comfortable`, `compact` | `comfortable` | FR-009 |
| `default_scope` | cadena | `all`, `work`, `personal` | `all` | Mismos valores que el `Scope` de las tareas más `all` (FR-010) |
| `board_order` | cadena | `oldest`, `newest` | `oldest` | FR-012 |
| `history_days` | entero o nulo | `30`, `90`, `null` (todo) | `null` | FR-013 |
| `display_name` | cadena o nulo | 1–50 caracteres tras `strip` | `null` | FR-016; `null` = usar el de Google o el correo |
| `avatar_kind` | cadena | `initials`, `preset`, `upload` | `initials` | FR-014 |
| `avatar_preset` | cadena o nulo | `avatar-01` … `avatar-12` | `null` | Solo con `avatar_kind = preset` |
| `avatar_version` | entero | ≥ 0 | `0` | Sube con cada cambio de avatar; invalida la caché del navegador |
| `avatar_uploads` | mapa | `{window_start: marca de tiempo, count: entero}` | ausente | Ventana fija de 1 hora para el límite de 10 subidas (R6) |
| `updated_at` | marca de tiempo | UTC | — | Solo trazabilidad |

### Reglas de validación (servidor, FR-023)

- Cada campo se valida contra su lista cerrada; un valor desconocido se rechaza con 422 y **no se
  guarda nada** (la actualización es atómica: o se aplican todos los campos enviados o ninguno).
- `display_name`: se recorta con `strip`, debe tener 1–50 caracteres, sin caracteres de control
  (categorías Unicode `Cc` y `Cf`, salvo emoji con unión de ancho cero). `null` o cadena vacía
  tras `strip` significa «volver al nombre de Google».
- `avatar_preset` solo es válido si pertenece al catálogo; elegirlo fija `avatar_kind = preset`.
  Elegir `initials` fija `avatar_preset = null`. **`avatar_kind = upload` solo lo fija la subida
  de imagen**, nunca una actualización de perfil (evita apuntar a una imagen inexistente).
- La actualización parcial solo toca los campos enviados; los campos extra se rechazan
  (`extra = forbid`).

### Transiciones

```text
avatar_kind:  initials ──elegir catálogo──▶ preset ──subir imagen──▶ upload
     ▲            ▲                           │                        │
     └────────────┴──────── quitar avatar ────┴────────────────────────┘
```

- `PUT /me/avatar` (imagen válida): `avatar_kind = upload`, `avatar_preset = null`,
  `avatar_version += 1`, escribe el documento `avatar` y cuenta una subida.
- `DELETE /me/avatar`: `avatar_kind = initials`, `avatar_preset = null`,
  `avatar_version += 1`, borra el documento `avatar`. No cuenta para el límite.
- Elegir `preset` o `initials` con una imagen subida existente **borra la imagen** (FR-020:
  no se conservan imágenes no usadas).
- `DELETE /me/profile` (restablecer) pone a su valor por defecto solo `theme`, `density`,
  `default_scope`, `board_order` y `history_days`. **No** toca `display_name` ni el avatar (R11).

## `users/{uid}/settings/avatar` — Imagen de avatar

Existe solo mientras `avatar_kind = upload`.

| Campo | Tipo | Notas |
|---|---|---|
| `data` | bytes | WebP cuadrado 256×256 ya reprocesado; sin metadatos. Tope defensivo de 200 KB |
| `content_type` | cadena | Siempre `image/webp` |
| `size` | entero | Bytes de `data` |
| `updated_at` | marca de tiempo | UTC |

La imagen original no se guarda nunca (R3).

## Efectos sobre otros modelos

- **Tareas**: ninguno. Los parámetros nuevos (`order`, `within_days`) solo cambian cómo se
  consulta o se ordena; el historial usa el campo `completed_at` ya indexado, sin índice nuevo
  (se comprueba con el emulador y con `firestore.indexes.json`).
- **Cuenta**: ninguno. Revocar una cuenta no borra el perfil ni el avatar (se conservan por si
  se restablece el acceso); el acceso a ellos se deniega igual que al resto de datos.
- **Reglas de Firestore**: sin cambios (acceso solo desde el backend con la cuenta de servicio).

## Volumen

Como mucho 2 documentos pequeños por persona (el avatar, ≤ 200 KB). Una lectura de `profile` por
carga de la aplicación y una de `avatar` por versión nueva, ya que el navegador conserva la imagen
(R5).
