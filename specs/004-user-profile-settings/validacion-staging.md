# Validación en staging — Feature 004 (T107)

**Fecha**: 2026-10-25
**Validado por**: el propietario, con cuentas reales en staging (desplegado por el pipeline desde `develop`).
**Escenarios**: 1, 4, 7, 9, 12 y 16 de [`quickstart.md`](./quickstart.md), más la comprobación de la CSP.

| Escenario | Resultado |
|---|---|
| 1 — Tema y recarga sin destello | ✅ Verificado por el propietario |
| 4 — Tablero por defecto | ✅ Verificado por el propietario |
| 7 — Nombre para mostrar | ✅ Verificado por el propietario |
| 9 — Subir imagen | ✅ Verificado por el propietario |
| 12 — Privacidad | ✅ Verificado por el propietario |
| 16 — Sin cambios para quien no toca nada | ✅ Verificado por el propietario |

El propietario confirmó el resultado en conversación («validado»); no se conservó el detalle por
escenario (cuentas usadas, capturas ni observaciones, ni el resultado concreto de la consola del
navegador respecto a la CSP). Si se necesita trazabilidad más fina, el propietario puede ampliar
esta tabla.

## Contenido desplegado

El contenido de `backend/` y `frontend/` que se promueve a producción es el que desplegó en
staging la fusión de la Fase 6 (`b878611`, `deploy-staging` en verde): la Fase 7 solo tocó
documentación, así que los hashes de árbol de ambos directorios coinciden y `validated-<hash>`
existe para los dos. El `deploy-staging` del commit de la Fase 7 falló en `backend-tests` por el
test flaky conocido de la 003 (`test_invite_the_same_address_twice_at_once_creates_it_once`),
sin relación con esta feature.

## Pendiente (no bloquea el release)

- Revisar los avisos de CVE de Pillow 13.0.0 (no hubo escáner disponible en la sesión del agente).
- Endurecer `_retry_on_abort` y el test de invitaciones de la 003 en una rama `fix/` propia.
