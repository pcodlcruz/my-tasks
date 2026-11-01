# Research: Progreso diario, tareas programadas y gamificación arcade

Decisiones técnicas de la feature 007. Cada una indica la alternativa más simple que se descartó
(Principio I). Modelo en [data-model.md](data-model.md); contratos en [contracts/](contracts/).

## R1. Evaluación perezosa en lugar de un proceso programado en la nube

**Decision**: no hay ningún proceso que se ejecute a las 04:00. Cerrar los días pasados, recalcular
la racha y generar las tareas programadas pendientes lo hace el backend **al atender una petición
de la propia persona**, en una operación idempotente de «puesta al día» (*catch-up*). La ejecuta solo
`GET /api/v1/me/progress`. El frontend la llama al cargar la aplicación y **antes** de pedir el
tablero (T056), así que las tareas generadas ya están cuando se lista. El listado del tablero no
cambia.

**Rationale**:
- La spec solo exige que las tareas estén en el tablero **la primera vez que se abre ese día**
  (FR-022, SC-004) y que los días cerrados no cambien (FR-006). Ambas cosas se cumplen calculando
  al primer acceso: nadie puede ver el tablero sin hacer antes esa petición.
- Una cuenta revocada no hace peticiones válidas, así que sus programaciones no generan tareas
  sin ninguna regla extra (FR-031).
- Sin infraestructura nueva: ni Cloud Scheduler, ni un *job* de Cloud Run, ni una identidad de
  servicio que invoque la API, ni cambios en `infra/` (Principios IV y V).

**Alternatives considered**:
- *Cloud Scheduler + endpoint interno* a las 04:00 de cada zona horaria: infraestructura nueva,
  una cuenta de servicio invocadora, un endpoint que recorra todas las cuentas (rompe el
  aislamiento por `uid` del token) y confirmación de cambios de infraestructura. Rechazado: no
  aporta nada visible a la persona.
- *Calcularlo todo en el cliente*: rompe FR-032 (el servidor calcula puntos, rachas y logros).

## R2. Un `GET` con efectos idempotentes

**Decision**: `GET /api/v1/me/progress` puede escribir (cerrar días, generar programadas), pero
solo de forma **idempotente**: repetirlo da el mismo estado. Responde con `Cache-Control: no-store`.

**Rationale**: es la misma petición que pide el marcador; separarla en un `POST /sync` obligaría
al cliente a hacer dos llamadas en orden en cada carga. La API se autentica con un *Bearer token*
en cabecera, no con *cookies*, así que un `GET` con efectos no abre una vía de CSRF.

**Alternatives considered**: `POST /api/v1/me/progress/sync` seguido de `GET`: dos viajes, y un
cliente que se salte el primero vería datos sin cerrar.

## R3. Día de progreso y zona horaria

**Decision**:
- Clave de día = fecha local en la zona horaria de la persona **menos 4 horas**:
  `(now.astimezone(ZoneInfo(tz)) - timedelta(hours=4)).date()`, guardada como `YYYY-MM-DD`
  (Clarification 2026-10-30).
- La zona horaria es un identificador IANA (`Europe/Madrid`) guardado en el perfil. El frontend la
  detecta con `Intl.DateTimeFormat().resolvedOptions().timeZone` y la envía la primera vez que no
  hay ninguna guardada. Si después detecta otra, ofrece cambiarla, sin cambiarla sola.
- El servidor valida la zona contra `zoneinfo.available_timezones()`.
- Se añade la dependencia **`tzdata`** (PyPI, fijada en el lockfile). La imagen de *buildpacks*
  (`google-24`) no garantiza `/usr/share/zoneinfo`; con `tzdata`, `zoneinfo` funciona en todos los
  entornos y en CI.

**Rationale**: el corte a las 04:00 cae fuera de las horas de cambio de horario europeas
(02:00/03:00), así que no hay días ambiguos en la práctica. Si alguna vez lo hubiera, `zoneinfo`
resuelve con `fold=0`.

**Alternatives considered**:
- Guardar un desfase fijo (`+01:00`): se equivoca con el cambio de horario.
- Usar la zona del navegador en cada petición: el día dependería del dispositivo y dos
  dispositivos podrían contar días distintos.

## R4. Un completado y sus puntos van en la misma transacción que la tarea

**Decision**: completar, reabrir y mandar a la papelera una tarea activa de la misión pasan a una
transacción de Firestore que lee y escribe a la vez:
1. el documento de la tarea;
2. el día de progreso de hoy (`users/{uid}/progress_days/{día}`);
3. el marcador (`users/{uid}/progress/state`).

Las reglas (qué suma, qué se retira, qué se anuncia) son funciones puras en
`domain/progress.py`; la transacción solo lee, llama al dominio y escribe.

**Rationale**:
- Garantiza SC-006: completar y reabrir en bucle, o en dos pestañas a la vez, no puede sumar dos
  veces.
- Firestore ya reintenta las transacciones con conflicto; el proyecto tiene tests de reintento
  (`test_profile_repository_retry.py`) que sirven de patrón.

**Alternatives considered**:
- *Escrituras separadas* (tarea, y luego progreso): un fallo a medias deja una tarea completada
  sin contar, o contada dos veces.
- *Recalcular todo a partir de las tareas completadas*: no puede respetar FR-006 (días cerrados
  inmutables) ni la regla de puntos «una vez en la vida» si la tarea se borra.

## R5. Reglas de los completados

**Decision**:

| Situación | Progreso del día | Puntos de tarea | Bonus |
|---|---|---|---|
| Completar una tarea nunca puntuada | +1 | +100 y se marca `points_awarded_on = hoy` | fase o misión, si se alcanzan |
| Completar una tarea ya puntuada otro día (reabierta) | +1 | 0 | fase o misión, si se alcanzan |
| Reabrir el mismo día en que se completó | −1 | −100 solo si se puntuó **hoy**, y se borra la marca | se retiran los que dejen de cumplirse |
| Reabrir un día posterior | sin cambio (el día del completado está cerrado) | sin cambio | sin cambio |
| Papelera o restauración de una completada | sin cambio | sin cambio | sin cambio |
| Papelera de una tarea **activa** que está en la misión de hoy | sin cambio | — | sale de la misión y la misión se reevalúa |

- La tarea guarda `completed_day`, el día de progreso de su completado actual. Es lo que
  distingue «reabrir hoy» de «reabrir otro día».
- Los bonus se guardan como indicadores en el día (`phase_bonus`, `mission_bonus`). Se conceden o
  retiran al cambiar el estado, nunca dos veces.
- Si la meta sube después de haberse cumplido, el bonus de fase ya ganado se conserva (edge case
  de la spec); la racha usa la meta vigente al cerrar el día.

**Rationale**: es exactamente lo que fijan FR-005, FR-006, FR-013 y las clarificaciones Q2 y Q4.

## R6. Cierre de días y racha

**Decision**: el marcador guarda `last_closed_day`. En cada puesta al día (R1), los días entre
`last_closed_day + 1` y ayer se cierran **en orden**:
- **Día activo** con la meta cumplida: la racha sube 1.
- **Día activo** sin la meta cumplida, o sin actividad: la racha vuelve a 0.
- **Día no activo**: la racha no cambia.
- Al cerrar, también se actualiza el récord (mejor día) y se comprueban los logros de racha.
- Cada día queda guardado con `closed = true`, su meta, si era activo y su resultado. Los días sin
  actividad se crean en ese momento, con la meta y los días activos vigentes. Así el calendario
  conserva la meta que tenía cada día (US5.4).
- Si hay más de 84 días sin cerrar (12 semanas, lo que muestra el calendario), solo se crean los
  últimos 84. La racha se pone a 0 si alguno de los días saltados era activo.

**Rationale**: la racha de hoy todavía no está cerrada. Se muestra como «racha actual + 1 si hoy
ya cumpliste la meta», con un indicador de «racha en juego», sin escribir nada hasta que se cierre.

**Alternatives considered**: recorrer el historial en cada lectura para calcular la racha:
lecturas proporcionales a su longitud y resultados que cambian si se edita algo.

## R7. Tareas programadas: generación sin duplicados

**Decision**:
- Cada programación guarda `next_occurrence` (fecha de progreso) y `last_task_id`. **Pausada,
  `next_occurrence = null`**: así basta la consulta `next_occurrence <= hoy` sobre un único campo,
  sin índice compuesto nuevo.
- Para cada programación vencida, una transacción:
  1. Relee la programación y comprueba que sigue vencida.
  2. Mira la última tarea generada. Si sigue activa, **no se crea otra** (FR-023): la tarea
     conserva `scheduled_for`, que la interfaz muestra como «pendiente desde».
  3. Si no hay ninguna activa y hay sitio (< 500 activas), crea **una sola** tarea con
     `scheduled_for` = la ocurrencia más reciente que ya ha vencido (≤ hoy).
  4. Mueve `next_occurrence` a la primera ocurrencia posterior a hoy. Una programación de fecha
     única pasa a `finished`.
- Si se alcanzan las 500 tareas activas, no se crea la tarea y se guarda un aviso en el marcador
  (`notices`), que la siguiente respuesta de progreso muestra y que se borra al confirmarlo.
- Repeticiones: `once` (fecha), `daily`, `weekly` (lista de días de la semana) y `monthly` (día
  1–31; en un mes más corto, el último día del mes). Todo es independiente de los días activos
  (Clarification Q3).
- Editar una programación recalcula `next_occurrence` desde hoy: incluye hoy si hoy toca y todavía
  no se ha generado nada hoy. Las tareas ya generadas no cambian.

**Rationale**: la transacción por programación impide duplicados con dos pestañas abiertas a la
vez. Si no se entra en varios días, solo se crea una tarea, la de la ocurrencia más reciente
(US4.4). El límite de 50 programaciones acota el coste de la puesta al día.

**Alternatives considered**:
- Una tarea por cada ocurrencia perdida: llenaría el tablero tras unas vacaciones; lo prohíbe la
  US4.4.
- Generar con antelación (la de mañana, hoy): aparecería antes de su día.

## R8. Puntos, niveles y logros como constantes de dominio

**Decision**: catálogo cerrado en `domain/progress.py`:
- **Puntos**: 100 por tarea, 500 de bonus de fase, 50 extra por tarea de la misión y 300 de bonus
  de misión cumplida.
- **Niveles**: 10 niveles con umbrales crecientes y nombre arcade.

  | Nivel | Puntos | Nombre |
  |---|---|---|
  | 1 | 0 | Novato |
  | 2 | 1 000 | Aprendiz |
  | 3 | 3 000 | Jugador |
  | 4 | 6 000 | Veterano |
  | 5 | 10 000 | Experto |
  | 6 | 16 000 | Maestro |
  | 7 | 25 000 | Campeón |
  | 8 | 40 000 | Leyenda |
  | 9 | 60 000 | Mito |
  | 10 | 90 000 | Jefe final |

  El nivel se **deriva** de la puntuación; no se guarda. El marcador guarda `max_level_announced`,
  para no volver a anunciar un nivel si se pierde por una reapertura y se recupera.
- **Logros** (12, nunca se retiran):

  | Logro | Condición |
  |---|---|
  | `first_coin` «Primera moneda» | 1.ª tarea puntuada |
  | `stage_clear` «Fase superada» | 1.er bonus de fase |
  | `mission_clear` «Misión cumplida» | 1.er bonus de misión |
  | `streak_3` | racha de 3 |
  | `streak_7` | racha de 7 |
  | `streak_30` | racha de 30 |
  | `tasks_10` | 10 tareas puntuadas |
  | `tasks_100` | 100 tareas puntuadas |
  | `tasks_500` | 500 tareas puntuadas |
  | `do_now_clear` «Sin urgencias» | completar una tarea de «Hacer ahora» y que no quede ninguna activa en ese cuadrante |
  | `scheduled_done` «Puntual» | completar una tarea generada por una programación |
  | `new_record` «Nuevo récord» | superar el récord diario, con al menos 5 tareas (el umbral es solo del logro; el anuncio «¡NUEVO RÉCORD!» sale con cualquier récord superado, ver R9) |

- Los valores de puntos y los umbrales de nivel se pueden ajustar en la implementación sin cambiar
  la spec (Assumptions). Si se cambian, solo afectan a lo que se gane desde entonces.

**Rationale**: datos estáticos y pequeños; tenerlos en código los hace testeables y evita otra
colección. Lo mismo se hizo con el catálogo de avatares de la feature 004.

## R9. Anuncios que se muestran una sola vez

**Decision**: el servidor guarda en el marcador una lista acotada (máx. 20) de anuncios
pendientes: `phase_clear`, `mission_clear`, `level_up`, `achievement`, `new_record`. La devuelve
`GET /api/v1/me/progress`, y el cliente la confirma con `POST /api/v1/me/progress/announcements/ack`
cuando la ha mostrado. Las respuestas de `complete` y `reopen` no cambian (`TaskOut`): el cliente
invalida la consulta de progreso y la vuelve a pedir.

El anuncio `new_record` sale la primera vez en el día que el recuento de hoy supera
`best_day_count`, siempre que exista algún día anterior cerrado con actividad
(`best_day_count > 0`); `record_announced_on` impide repetirlo ese día. Bajar del récord por una
reapertura no lo retira.

Si una reapertura retira el bonus de fase o de misión, su anuncio pendiente (no confirmado) se
elimina. Una vez confirmado, no se vuelve a mostrar aunque se recupere el bonus el mismo día.

**Rationale**: FR-015, FR-016 y FR-017 piden anunciar una sola vez. Con varios dispositivos, si el
cliente compara el estado anterior con el nuevo, puede repetir el anuncio o no mostrarlo nunca.

**Alternatives considered**: devolver los eventos en la respuesta de `complete`: no cubre los
anuncios que nacen al cerrar días (rachas) y obliga a cambiar `TaskOut`.

## R10. Misión del día

**Decision**: la misión de hoy vive en el día de progreso (`mission_task_ids`, máx. 5). Se fija
con `PUT /api/v1/me/progress/today/mission`, que reemplaza la lista entera.
- El servidor comprueba que cada id es una tarea **activa** de la persona, que no está en la
  papelera y que no hay duplicados.
- Marcar o desmarcar no da ni quita puntos (FR-013). El extra de misión solo se suma al completar
  una tarea que ya está en la misión.
- Si después de completar tareas se añade a la misión una tarea activa y se completa, cuenta como
  misión. Una tarea completada antes de ser misión no se puede añadir: ya no está activa.
- Al reemplazar la lista, las tareas de la misión **ya completadas hoy** pueden seguir en ella
  aunque no estén activas. Así se pueden añadir otras sin perderlas.
- Cumplida = la misión no está vacía y todas sus tareas están completadas hoy. Se evalúa al
  completar, al reabrir, al cambiar la misión y al mandar a la papelera una tarea de la misión.
- La misión caduca sola: el día siguiente es otro documento.

## R11. Ajustes de progreso dentro del perfil existente

**Decision**: los ajustes se añaden como campos al documento de perfil de la feature 004
(`users/{uid}/settings/profile`) y a `PATCH /api/v1/me/profile`:

| Campo | Valores | Por defecto |
|---|---|---|
| `daily_goal` | 1–20 | 3 |
| `active_weekdays` | lista de 1 a 7 días, ISO 1 = lunes … 7 = domingo | todos |
| `timezone` | identificador IANA | `null` hasta que el cliente lo envía; mientras, `Europe/Madrid` |
| `morning_review` | sí / no | sí |
| `arcade_mode` | sí / no | sí |

«Restablecer valores por defecto» (`DELETE /me/profile`) **no** los toca. Son reglas del juego:
reiniciarlos a mitad de día cambiaría la meta o la racha sin que la persona lo pida.

**Rationale**: reutiliza la sección «Perfil», la validación y la caché del cliente ya existentes,
sin otro documento ni otro endpoint. La sección de la 004 no se ve afectada: los campos nuevos
tienen valores por defecto.

## R12. Lectura del historial de progreso

**Decision**:
- `GET /api/v1/me/progress/days?from=&to=` devuelve como mucho 84 días (consulta por rango sobre el
  campo `date`; índice de un solo campo automático).
- `GET /api/v1/me/progress/days/{date}` devuelve el detalle de un día, con sus tareas: lectura por
  ids con `get_all`, en bloques, sin las que están en la papelera o purgadas.
- Las estadísticas (mejor día, rachas, total, nivel) salen del marcador, sin agregaciones.
- No hace falta ningún índice compuesto nuevo; `firestore.indexes.json` no cambia.

## R13. Interfaz arcade

**Decision**:
- **Tipografía**: «Press Start 2P» (licencia OFL), autoalojada en `frontend/src/assets/fonts/` con
  `font-display: swap`. La CSP ya tiene `font-src 'self'`, así que no hay que relajarla. Se usa
  solo en cifras y rótulos cortos (marcador, «¡FASE SUPERADA!»); el texto normal sigue con la
  tipografía actual, por legibilidad.
- **Colores**: los tokens nuevos (barra de energía, oro de logros) se añaden como variables CSS en
  claro y oscuro, como hizo la feature 004, con contraste AA comprobado por axe (FR-020, SC-008).
- **Celebraciones**: un aviso no modal en una región `aria-live="polite"`, que se cierra solo en
  unos 3 s y nunca bloquea el tablero. Con `prefers-reduced-motion: reduce`, sin animación. Sin
  sonido (FR-019).
- **Pantalla de inicio de jornada**: un diálogo modal accesible (foco atrapado, Escape, devolución
  del foco con el `useRestoreFocus` existente), desde el que se puede elegir la misión.
- **Navegación**: dos rutas nuevas, `/progreso` (calendario, estadísticas y sala de trofeos) y
  `/programadas`. La cabecera ya desbordó con «InsertTasks» en la feature 006. Las pestañas nuevas
  tienen que caber a 320 px con la cuenta de administrador, comprobado con el e2e de reflujo que
  ya existe.

## R14. Diseño en Stitch primero

**Decision**: igual que en las features 001 y 004, la Fase 1 diseña en Stitch, sobre el proyecto y
el *design system* actuales, las pantallas de [contracts/ui-screens.md](contracts/ui-screens.md),
en claro y oscuro y en escritorio y móvil. Las pantallas ya aprobadas que cambian (tablero y
«Perfil») van como **versiones nuevas**. El propietario aprueba en un punto de control antes de
cualquier código de interfaz. Se prevén reintentos por los *timeouts* conocidos del MCP de Stitch.

**Excepción del Principio VIII**: ningún skill cubre Stitch; se hace a mano con su MCP, como en la
001 y la 004.

## R15. Reloj inyectable para los tests

**Decision**:
- El dominio y los servicios de progreso reciben el «ahora» de un `Clock` inyectable. Por defecto,
  `datetime.now(UTC)`.
- Los tests unitarios y de integración lo sustituyen con `dependency_overrides` de FastAPI.
- Los e2e de Playwright no pueden sustituir dependencias. Para ellos, el backend acepta la cabecera
  `X-Test-Now` (instante ISO 8601) **solo si `APP_ENV=local`**. En cualquier otro entorno la
  cabecera se ignora y se registra un aviso. Hay un test de integración que comprueba que fuera de
  `local` no tiene efecto.

**Rationale**: los escenarios de cambio de día, racha y repeticiones no se pueden probar de
extremo a extremo sin mover el reloj del servidor. El patrón es el mismo que ya protege los
emuladores: la API se niega a arrancar con `FIRESTORE_EMULATOR_HOST` fuera de `local`.

**Alternatives considered**: cambiar el reloj del contenedor (no es reproducible en CI); probar el
cambio de día solo con unitarios (deja los flujos de la US2 y la US4 sin e2e, contra el
Principio II).

## R16. Revisión de seguridad

**Decision**: la feature cambia el modelo de datos, con cuatro colecciones o documentos nuevos y
campos nuevos en la tarea. Por eso hay revisión con `mytasks-security-auditor` en las fases de
backend y una revisión final. Puntos a revisar:
- El `uid` sale solo del token.
- Validación cerrada (`extra = forbid`) de los ajustes, la misión y las programaciones.
- Ningún valor de juego se acepta del cliente (FR-032).
- Límites de tamaño: 50 programaciones, 5 tareas en la misión, 84 días por consulta, 20 anuncios.
- Los eventos de registro (`log_event`) no incluyen títulos de tareas.
- El `GET` con efectos es idempotente (R2).
