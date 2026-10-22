# Quickstart: validar el perfilado de usuarios e invitaciones

Guía de validación de extremo a extremo en local. Contratos en [contracts/access.yaml](contracts/access.yaml);
modelo en [data-model.md](data-model.md).

## Prerrequisitos

- Emuladores de Firestore y Auth en marcha (`firebase emulators:start`), `APP_ENV=local`.
- `BOOTSTRAP_ADMIN_EMAIL=admin@example.com` en `backend/.env` (solo local; ver `.env.example`).
- Backend y frontend arrancados como en la quickstart de la feature 001.

## Escenarios

1. **Desconocido denegado (US1, SC-001)**: iniciar sesión con `extra@example.com` (sin
   invitación). Esperado: pantalla "necesitas invitación"; en Firestore no existe
   `users/{uid}` ni datos suyos; el log contiene `access_denied`.
2. **Bootstrap del administrador (US1.3, FR-013)**: iniciar sesión con `admin@example.com`.
   Esperado: entra como `admin` y ve el enlace de administración; si ya tenía tareas, siguen ahí.
3. **Invitar y aceptar (US2, SC-002)**: como admin, invitar `ana@example.com`; cerrar sesión e
   iniciar con esa cuenta. Esperado: entra como `user` con lista vacía; la invitación pasa a
   `accepted`; un segundo inicio de sesión no crea otra cuenta.
4. **Un user no administra (US4, SC-004)**: con `ana`, el enlace de administración no aparece
   y `GET /api/v1/admin/access` responde 403; sin token responde 401.
5. **Revocar (US3, SC-003)**: como admin, retirar el acceso a `ana`. Esperado: su siguiente
   petición recibe 403 y la interfaz muestra "sin acceso"; sus tareas siguen en Firestore.
6. **Reactivar (US3.5)**: volver a invitar `ana@example.com`. Esperado: `outcome =
   reactivated`, `ana` entra y recupera sus tareas.
7. **No se revoca al administrador (FR-012)**: `DELETE /api/v1/admin/users/{uid-admin}`
   responde 409.

## Comandos de prueba

```bash
# Backend: unitarios e integración (con los emuladores en marcha)
cd backend && pytest tests/unit tests/integration

# Frontend: unitarios y e2e
cd frontend && npm test && npm run e2e
```

Resultado esperado: todo en verde, incluida la prueba parametrizada que comprueba el 403 en
cada endpoint de tareas sin cuenta o con cuenta revocada, y los flujos e2e de los escenarios 1–6.

## Validación en staging (tras desplegar por el pipeline)

Repetir los escenarios 1–3 con cuentas reales de prueba. Verificar antes que la variable
`BOOTSTRAP_ADMIN_EMAIL` existe en el GitHub Environment `staging`; el pipeline falla si falta.
