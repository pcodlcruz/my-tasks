# Quickstart: validar el progreso diario, las tareas programadas y la gamificación

Guía de validación de extremo a extremo. Contratos en [contracts/progress.yaml](contracts/progress.yaml)
y [contracts/ui-screens.md](contracts/ui-screens.md); modelo en [data-model.md](data-model.md); reglas
en [research.md](research.md).

## Prerrequisitos

- Emuladores de Firestore y Auth en marcha, `APP_ENV=local`, backend y frontend arrancados como en
  la quickstart de la feature 004.
- Dos cuentas activas: `admin@example.com` y la invitada `ana@example.com`, con tareas en los
  cuatro cuadrantes.
- **Reloj controlable**:
  - Backend: los tests unitarios e integración inyectan el «ahora» (un `Clock` en el servicio), sin
    tocar el reloj del sistema.
  - Playwright: los e2e simulan la hora con la cabecera `X-Test-Now`, que añaden a las llamadas a
    la API con `page.route('http://localhost:8000/api/**')` (`frontend/tests/e2e/fixtures/clock.ts`).
    **No** se usa `page.clock`: invalida los tokens de Firebase. La cabecera **solo funciona con
    `APP_ENV=local`**: en cualquier otro entorno el backend la ignora y registra
    `test_clock_ignored` (lo revisa la auditoría de seguridad).
  - A mano, se puede cambiar la zona horaria en «Perfil» para «mover» el día.

## Escenarios

1. **Marcador del día (US1.1–US1.3, SC-001, SC-002)**: cuenta nueva → el tablero muestra «HOY 0/3».
   Completar tres tareas: 1/3, 2/3 y 3/3 sin recargar, en menos de 1 s. En la tercera aparece
   «¡FASE SUPERADA! +500». Una cuarta muestra 4/3.
2. **Reabrir el mismo día (US1.4, US3.5, SC-006)**: reabrir una de las completadas → 3/3 sigue
   cumplida y la puntuación baja 100. Reabrir otra → 2/3, se retira el bonus de fase y desaparece
   «fase superada». Completar y reabrir la misma tarea diez veces: la puntuación final es la de
   una sola vez.
3. **Corte a las 04:00 (US1.6, US1.7)**: con el reloj a las 00:30, completar una tarea: cuenta en el
   día anterior y la pantalla de inicio de jornada no sale. Pasar a las 04:01 y recargar: «HOY 0/3»
   y sale la pantalla de inicio de jornada.
4. **Reabrir otro día (Clarification Q2)**: una tarea completada ayer, reabierta y completada hoy,
   suma 1 al progreso de hoy y no da puntos de tarea. El día de ayer no cambia en `/progreso`.
5. **Inicio de jornada (US2, SC-003)**: primera apertura de un día activo → S8 con el resultado de
   ayer, la racha, la meta, «Hacer ahora» y las programadas de hoy. «Empezar» → tablero. Recargar
   y abrir con la misma cuenta en otro navegador: no vuelve a salir. Reabrirla desde el marcador.
   Desactivarla en «Perfil»: al día siguiente no sale. Marcar domingo como no activo: el domingo no
   sale.
6. **Misión del día (US2.7, US3.12, US3.13, FR-004)**: en S8, elegir 2 tareas como misión; añadir
   una tercera desde el botón de su tarjeta en el tablero. Completarlas:
   +50 cada una y «¡MISIÓN CUMPLIDA! +300». Intentar 6 tareas, una completada o una de `ana`: 422.
   Al día siguiente la misión está vacía y las no completadas siguen activas. Mandar a la papelera
   una tarea de la misión: sale de la misión y, si las demás ya estaban completadas, se concede el
   bonus.
7. **Racha y días no activos (US3.2–US3.4, Clarification Q4)**:
   - Cumplir la meta 3 días activos seguidos: racha 3 y logro `streak_3`.
   - Un día activo sin cumplirla: al día siguiente, racha 0 y la mejor racha se conserva.
   - Un día no activo sin actividad: la racha no cambia.
   - Un día no activo cumpliendo la meta: bonus de fase y la racha no sube.
8. **Niveles, logros y récord (US3.7–US3.9)**: cruzar 1 000 puntos → «¡SUBES DE NIVEL! Nivel 2 ·
   Aprendiz», una sola vez aunque se reabra y se vuelva a cruzar. El primer completado desbloquea
   «Primera moneda», visible en la sala de trofeos con su fecha. Con algún día anterior con actividad,
   superar el récord → «¡NUEVO RÉCORD!» una vez al día; si además hay ≥ 5 tareas, logro «Nuevo
   récord». El primer día con actividad no anuncia récord. Con dos navegadores abiertos, cada anuncio se ve en uno solo.
9. **Modo arcade desactivado (US3.10)**: desactivarlo → sin puntuación, nivel, logros ni
   celebraciones; con meta, progreso y racha. Completar tareas y reactivarlo: la puntuación incluye
   lo ganado mientras estuvo desactivado.
10. **Privacidad (US3.11, FR-031)**:
    - Con el token de `ana`, ningún endpoint de [progress.yaml](contracts/progress.yaml) devuelve
      datos de `admin`.
    - Un `schedule_id` o un `day` de otra persona → 404.
    - Sin token → 401. Cuenta revocada → 403, y sus programaciones no generan tareas.
11. **Programada de fecha única (US4.1)**: crear una para mañana; en `/programadas` sale «Próxima
    aparición: mañana». Pasar al día siguiente (04:01) y abrir: la tarea está en su cuadrante con la
    marca de programada, y la programación queda «terminada». Una fecha pasada → 422.
12. **Repetición semanal sin duplicados (US4.2, US4.3, SC-004)**: lunes y miércoles. El lunes
    aparece. Sin completarla, el miércoles no hay duplicado y la tarea muestra «pendiente desde el
    lunes». Completarla y pasar al lunes siguiente: aparece una nueva.
13. **Varios días sin entrar (US4.4)**: con una diaria, no abrir la aplicación en 4 días: al volver
    hay una sola tarea, con la ocurrencia de hoy.
14. **Día 31 (edge case)**: una mensual el día 31, en un mes de 30 días: aparece el día 30.
15. **Editar, pausar y eliminar (US4.5, US4.6, US4.8)**:
    - Cambiar el título de una diaria: la tarea ya generada no cambia y la de mañana sí.
    - Pausar: no genera tareas. Reanudar: la próxima aparición se calcula desde hoy.
    - Eliminar: la tarea generada se queda como tarea normal.
16. **Límites (US4.7, FR-024, FR-026)**: con 500 tareas activas, la programada que toca no se crea
    y aparece el aviso de que no cupo; confirmarlo lo quita. La programación número 51 → 409.
17. **Dos pestañas a la vez (R7)**: abrir dos pestañas a las 04:01 con una programada vencida: hay
    una sola tarea generada.
18. **Historial de progreso (US5, SC-009)**: `/progreso` muestra 12 semanas, con meta cumplida, no
    activos y futuros distinguibles sin depender del color. Seleccionar un día lista sus tareas
    (no las de la papelera). Cambiar la meta de 3 a 5: los días anteriores conservan 3.
19. **Zona horaria (edge case)**: cambiar a `America/New_York` en «Perfil»: el día de hoy se
    recalcula y los días cerrados no cambian. Un valor inventado → 422.
20. **Fallo de carga (FR-034)**: con el endpoint de progreso fallando, el tablero, el historial y
    la papelera funcionan y el marcador muestra un aviso discreto.
21. **Accesibilidad (FR-019, FR-020, SC-008)**: axe sin incumplimientos AA en `/`, `/progreso`,
    `/programadas`, S8 y «Perfil», en claro y oscuro. Con movimiento reducido, las celebraciones son
    estáticas. La cabecera con la cuenta de administrador cabe a 320 px.

## Cobertura automática de los escenarios (T118, 2026-11-01)

Los 21 escenarios se validaron en local con las baterías completas contra los emuladores
(backend 920, frontend 588 unitarios y 96 e2e, todo en verde). **No es una pasada manual en el
navegador**: cada escenario lo cubre un test, y los que dependen de un día real distinto
(escenarios 3, 11, 12 y 13) se simulan con el reloj de prueba. Los dos primeros ficheros de cada
fila son del backend (`backend/tests/…`); `e2e` es `frontend/tests/e2e/…`.

| Escenario | Qué lo cubre |
|---|---|
| 1 Marcador del día | e2e `progress-day`, `arcade`; integración `test_progress` |
| 2 Reabrir el mismo día | integración `test_progress_transitions` (incluye diez ciclos) |
| 3 Corte a las 04:00 | e2e `progress-day`; unitario `domain/test_progress_day_key` |
| 4 Reabrir otro día | integración `test_progress_transitions` |
| 5 Inicio de jornada | e2e `start-of-day`; integración `test_progress_mission` (revisión vista una vez, día no activo, desactivada) |
| 6 Misión del día | e2e `start-of-day`; integración `test_progress_mission` |
| 7 Racha y días no activos | unitarios `domain/test_progress_close` y `test_progress_rules` |
| 8 Niveles, logros y récord | e2e `arcade` (un anuncio por navegador); integración `test_progress_announcements` |
| 9 Modo arcade desactivado | e2e `arcade`; e2e `progress-history` (sin trofeos ni puntos) |
| 10 Privacidad | integración `test_progress_isolation`, `test_schedules`, `test_schedule_generation` (cuenta revocada) |
| 11 Programada de fecha única | integración `test_schedule_generation`; e2e `schedules` |
| 12 Semanal sin duplicados | integración `test_schedule_generation` (sin duplicado); e2e `schedules` |
| 13 Varios días sin entrar | integración `test_schedule_generation` (una sola tarea, la del último día) |
| 14 Día 31 | unitario `domain/test_recurrence` |
| 15 Editar, pausar y eliminar | integración `test_schedules`, `test_schedule_generation`; e2e `schedules` |
| 16 Límites | integración `test_schedules` (la 51 → 409, creaciones en paralelo) y `test_schedule_generation` (500 activas y aviso) |
| 17 Dos pestañas a la vez | integración `test_schedule_generation` (dos lecturas simultáneas, una tarea) |
| 18 Historial de progreso | e2e `progress-history`; integración `test_progress_days`; unitarios de `features/progress` |
| 19 Zona horaria | unitarios `domain/test_progress_day_key` y `test_profile_domain`; integración `test_profile`; e2e `progress-day` (se guarda sola) |
| 20 Fallo de carga | unitarios de `features/progress` (`DayScoreboard`); integración `test_schedule_generation` (generación que falla) |
| 21 Accesibilidad | e2e `a11y` (axe en claro y oscuro de `/`, `/progreso`, `/programadas`, S8 y «Perfil», movimiento reducido y 320 px) |

**Rendimiento**: `test_performance.py` (feature 001) no entra en la ejecución por defecto
(`-m 'not perf'`); se lanza aparte con `pytest -m perf tests/integration/test_performance.py` y
pasa (p95 por debajo de su umbral) con la puesta al día del progreso incluida.

**Fuera del alcance de los tests**: la validación con cuentas reales en staging y producción (T122
y T125) y los cambios de día reales, porque el reloj de prueba no existe fuera de local.

## Comandos

```bash
# Backend: unitarios (dominio de progreso y repeticiones) e integración contra los emuladores
uv --directory backend run pytest tests/unit tests/integration

# Frontend: unitarios y e2e (con los emuladores en marcha)
npm --prefix frontend run test
npm --prefix frontend run test:e2e
```

**Resultado esperado**: todo en verde, y `test_performance.py` de la feature 001 (`pytest -m perf`)
sigue por debajo de su umbral (p95 < 300 ms) con la puesta al día del progreso incluida en la carga
del tablero.
