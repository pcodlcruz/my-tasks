---

description: "Lista de tareas de implementación de la feature 004-user-profile-settings"
---

# Tasks: Perfil de usuario y preferencias

**Input**: documentos de diseño de `specs/004-user-profile-settings/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/profile.yaml](./contracts/profile.yaml),
[contracts/ui-screens.md](./contracts/ui-screens.md), [quickstart.md](./quickstart.md)

**Tests**: **obligatorios** por el Principio II (NON-NEGOTIABLE): unitarios para el dominio, el
servicio y la lógica de interfaz; integración por cada endpoint nuevo o modificado; y e2e con
Playwright por cada flujo principal. Se escriben primero y deben fallar antes de implementar.

**Organization**: las fases siguen el orden del plan (Fases 1 a 7) porque cada `## Phase N` se
entrega en su propia rama `feature/004-user-profile-settings-fase-N` y PR a `develop`
(Principio VII). Cada tarea lleva la historia a la que sirve: **US1** apariencia, **US2** tablero
por defecto y orden, **US3** nombre y avatar predefinido, **US4** subir imagen propia.

**Cómo se reparte el trabajo y por qué este orden**:

- La **Fase 1 (diseño en Stitch)** no tiene código y es la única que necesita al propietario en un
  punto de control: nadie empieza el código de interfaz (Fases 3 a 6) hasta que esté fusionada y
  aprobada (FR-027).
- La **Fase 2 (backend)** solo añade endpoints y dos parámetros opcionales; no cambia ningún
  comportamiento existente (SC-009), así que `develop` sigue desplegable. Puede ir en paralelo a la
  Fase 1.
- Cada fase de interfaz deja la aplicación **completa y usable**: ningún control aparece sin su
  endpoint, y los e2e existentes (check obligatorio) siguen en verde.
- La cabecera cambia en dos pasos: la Fase 3 añade solo un enlace «Perfil»; la Fase 5 lo sustituye
  por avatar + nombre, tal como se aprobará en la Fase 1.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1…US4); sin etiqueta, la tarea es de
  soporte o de cierre
- **(propietario)**: acto humano que el agente no puede ni debe hacer (incluida toda fusión de PR:
  un agente nunca ejecuta `merge`)

## Convenciones

- Estructura: `backend/`, `frontend/`, `docs/design/` (ver plan.md, *Source Code*).
- Tests de backend: `backend/tests/unit/…` e `integration/…` (contra los emuladores). Tests de
  frontend: unitarios en `frontend/tests/unit/…` y e2e en `frontend/tests/e2e/…`; comandos
  `npm test` y `npm run test:e2e`.
- Código y comentarios en **inglés**; documentación, interfaz y PRs en **español**; commits en
  inglés con Conventional Commits (Principio IX).
- Backend con `mytasks-backend-developer`, frontend con `mytasks-frontend-developer`, revisiones
  con `mytasks-security-auditor` (Principio VIII). El diseño en Stitch lo hace el agente a mano con
  el MCP de Stitch: ningún skill lo cubre (excepción justificada, research R12).
- Esta feature **no** requiere ninguna operación del agente sobre Google Cloud, ni cambios de
  `infra/`, de IAM o de variables de despliegue.
- Los identificadores `T###` se asignan en orden de ejecución.

---

## Phase 1: Diseño en Stitch (sin código)

**Purpose**: diseñar las versiones nuevas de las pantallas afectadas y la paleta oscura, y
conseguir la aprobación del propietario antes de escribir código de interfaz. Las pantallas
aprobadas de la feature 001 **no se modifican ni se borran**: cada cambio es una versión nueva
(FR-028).

**Goal**: el propietario ha aprobado S7 Perfil (con selector de avatar y recortador), el catálogo
de 12 avatares, las versiones con cabecera nueva de S3, S4, S5 y S6, la densidad compacta del
tablero y el tema oscuro de las seis pantallas, y `docs/design/` lo refleja. Ver
[contracts/ui-screens.md](./contracts/ui-screens.md) para el contenido exacto de cada pantalla.

**Independent Test**: abrir `docs/design/screens/README.md` y comprobar que cada pantalla vigente
tiene identificador de Stitch, fecha de aprobación y HTML y captura versionados; y que el script
de contraste de la paleta oscura no devuelve ningún par por debajo de AA.

> **Punto de control en dos rondas (decisión del propietario, 2026-10-23)**: el MCP de Stitch
> tarda unos 45-60 minutos en colocar cada pantalla, y son 28 en total. La **ronda 1** (T013) aprueba
> solo el subconjunto que desbloquea las Fases 2 a 3: S7 Perfil, S3 `-v2` y S3 compacto en claro, y
> S3 y S7 en oscuro, en escritorio y móvil (10 pantallas), con la paleta oscura. La **ronda 2** aprueba
> el resto (S1 oscuro, S4, S5 y S6 en claro y oscuro, y el selector de avatar con recortador) y debe
> estar hecha **antes de empezar la Fase 4** (necesita S5) y la **Fase 5** (necesita el selector).
> Cada ronda se registra en `docs/design/screens/README.md`.
>
> El MCP de Stitch ha dado timeouts muy irregulares (6 s a 21 min). Se genera por **orden de
> prioridad**: S7 claro → S3 `-v2` → S3 oscuro → S7 oscuro → S3 compacta → S5 → S4 → S6 → S1.
> Un timeout no implica que no se generara: antes de reintentar, usar `list_screens` (ver
> `docs/design/screens/README.md`). Si una pantalla falla tras los reintentos, se avisa en el
> punto de control en lugar de bloquear la fase.

- [X] T001 Comprobar el acceso al proyecto Stitch «MyTasks» (`projects/13869439670490335529`) con `mcp__stitch__get_project` y `list_screens`, leer `docs/design/DESIGN.md` y `docs/design/screens/README.md`, y anotar en `docs/design/screens/README.md` una sección «Feature 004 · versiones nuevas» con los identificadores de las pantallas base (S1, S3, S4, S5, S6, escritorio y móvil) *Hecho.*
- [X] T002 Proponer la **paleta oscura** como sección nueva «Tema oscuro» de `docs/design/DESIGN.md` (mismos nombres semánticos que `frontend/tailwind.config.ts`: texto, superficie, borde, primario, error, éxito, deshabilitado, cuadrantes y ámbitos; **sin tocar los valores claros**) y escribir `docs/design/check-contrast.py` (solo biblioteca estándar) que calcula los ratios de todos los pares y falla si alguno baja de AA (4,5:1 texto, 3:1 texto grande, iconos y bordes de controles); incluir su salida en `DESIGN.md` *Hecho: 0 pares por debajo de AA en ambos temas.*
- [X] T003 Añadir la paleta oscura al *design system* de Stitch con `mcp__stitch__update_design_system` (solo adición; los valores claros no cambian) y anotar su identificador en `docs/design/screens/README.md` *Hecho como asset aparte (`assets/16783421015770598561`): Stitch admite un solo modo de color por sistema y `update_design_system` habría convertido el aprobado en oscuro.*
- [X] T004 Generar **S7 · Perfil** claro en escritorio y móvil según `contracts/ui-screens.md` (identidad, apariencia, tablero e historial, restablecer, todos los estados), junto con el **selector de avatar** (pestañas Catálogo / Subir imagen) y el **recortador** (vista cuadrada con zoom y vista previa redonda), y registrar los identificadores en `docs/design/screens/README.md` *Hecho para S7 claro en escritorio y móvil. El selector de avatar y el recortador pasan a T113.*
- [X] T005 Generar el **catálogo de 12 avatares** (`avatar-01` … `avatar-12`: figuras simples y neutras, legibles a 32 px, sin rostros reales, con nombre en español para el texto alternativo) como una pantalla de rejilla en Stitch, en claro y en oscuro, y anotar el nombre de cada uno en `docs/design/screens/README.md` *Movido a T113: el catálogo se diseña dentro del selector de avatar.*
- [X] T006 Generar **S3 · Tablero `-v2`** claro (cabecera con avatar + nombre enlazado a «Perfil» y «Cerrar sesión»; filtro de ámbito con el valor del perfil seleccionado) en escritorio y móvil, a partir de la pantalla aprobada `79c364a0e3e6454488990bcf380db4af` / `8f8343490e0f494982ba5b2a7d74fa96` *Hecho solo en escritorio (`a3f141c47d3946ea9c1466f3916df60d`); el móvil pasa a T109.*
- [X] T007 Generar **S3 oscuro** y **S7 oscuro** (escritorio y móvil) con los tokens de T003, incluidos el **selector de avatar** y el **recortador** en oscuro (axe los validará en ambos temas) *Hecho solo para S7 oscuro en escritorio; S3 oscuro y S7 oscuro móvil pasan a T109, y el selector y el recortador en oscuro a T113.*
- [X] T008 Generar **S3 compacta** (`-compact`, claro, escritorio y móvil): tarjetas con menos relleno y separación, zona de pulsación ≥ 32 px, y comprobar sobre la maqueta que caben al menos un 25 % más de tareas que en la cómoda (SC-005) *Movido a T109.*
- [X] T009 Generar **S5 · Historial `-v2`** claro y oscuro (escritorio y móvil) con la franja «Mostrando solo los últimos N días · Ver todo» cuando hay un periodo activo *Movido a T111.*
- [X] T010 Generar **S4 · Formulario de tarea `-v2`** claro y oscuro y **S6 · Papelera `-v2`** claro y oscuro (escritorio y móvil): solo cambian la cabecera y el tema *Movido a T111.*
- [X] T011 Generar **S1 · Iniciar sesión** oscuro (escritorio y móvil); la versión clara aprobada sigue vigente *Hecho solo en escritorio (`152e0cebe5114f25acd072fca6b63c84`); el móvil pasa a T111.*
- [X] T012 Exportar el HTML y la captura PNG de cada pantalla generada (T004–T011; primero las de la ronda 1, después las de la ronda 2) a `docs/design/screens/<id>-<sufijo>/` (`desktop.html`, `desktop.png`, `mobile.html`, `mobile.png`, como las existentes) y actualizar la tabla de estado de `docs/design/screens/README.md` marcando cada una como **pendiente de aprobación** *Hecho para las cuatro pantallas aprobadas (S7 claro escritorio y móvil, S7 oscuro escritorio y S3 v2 claro escritorio).*
- [X] T013 (propietario) **Punto de control humano, ronda 1**: revisar en Stitch y en `docs/design/screens/` las 10 pantallas del subconjunto prioritario (S7 Perfil, S3 `-v2`, S3 compacto, S3 oscuro y S7 oscuro, escritorio y móvil) y la paleta oscura (con la salida de `check-contrast.py`); aprobar, o pedir cambios (en ese caso se repite el paso afectado). La **ronda 2** (S1 oscuro, S4, S5, S6 y el selector de avatar con catálogo y recortador) se aprueba en una segunda revisión antes de la Fase 4 *Hecho el 2026-10-23: el propietario aceptó los diseños existentes.*
- [X] T014 Registrar las aprobaciones en `docs/design/screens/README.md` (identificador de Stitch, fecha y **pantalla vigente** de cada una; las aprobadas de la 001 siguen intactas como referencia anterior) y marcar el avance de esta fase en este fichero *Hecho el 2026-10-23.*

**Checkpoint**: ronda 1 aprobada en parte (S7 y S3 v2 claro escritorio, y la paleta oscura). Lo que falta de Stitch pasa a tareas con diseño pendiente al inicio de las Fases 3, 4 y 5 (T109–T114). La Fase 2 no depende del diseño.

---

## Phase 2: Backend del perfil (base de US1, US2 y US3)

**Purpose**: guardar y servir las preferencias de la persona y ordenar/limitar el listado de
tareas, con autorización estricta y validación en el servidor. Agente: `mytasks-backend-developer`;
revisión: `mytasks-security-auditor`. Cambio puramente aditivo: sin documento de perfil, la API se
comporta como hasta ahora (SC-009).

**Goal**: `GET/PATCH/DELETE /api/v1/me/profile` operativos para una cuenta activa, con valores por
defecto, validación atómica y aislamiento por `uid`; y `GET /api/v1/tasks` aceptando `order` y
`within_days`. No hay todavía subida de imagen (Fase 6), pero elegir `initials` o `preset` ya
elimina una imagen subida si la hubiera.

**Independent Test**: con los emuladores, una cuenta activa lee su perfil por defecto, cambia
`theme` y `display_name`, restablece, y una cuenta sin acceso recibe 403 en todos los endpoints
nuevos; `GET /api/v1/tasks?view=board&order=newest` y `?view=history&within_days=30` devuelven lo
esperado.

### Tests de la Fase 2 (escribirlos primero; deben fallar)

- [X] T015 [P] [US1] Tests unitarios del dominio del perfil en `backend/tests/unit/domain/test_profile_domain.py` (no `test_profile.py`: chocaría con el de integración, pytest no admite dos módulos con el mismo nombre): valores por defecto, listas cerradas (`theme`, `density`, `default_scope`, `board_order`, `history_days`), catálogo de exactamente 12 avatares `avatar-01…12`, validación del nombre (recorte, 1–50 caracteres, caracteres de control, acentos y emojis válidos, vacío ⇒ `None`), que `upload` no se puede fijar por actualización de perfil, y las transiciones de `avatar_kind` de `data-model.md`
- [X] T016 [P] [US2] Tests unitarios de `sort_board(order)` en `backend/tests/unit/domain/test_board_order_and_edit.py`: `oldest` (actual) y `newest`, con las fijadas siempre primero en ambos, y desempate estable
- [X] T017 [P] [US1] Tests unitarios del servicio en `backend/tests/unit/services/test_profile_service.py` (repositorio falso): lectura con valores por defecto, actualización parcial atómica, restablecer solo las cinco preferencias de visualización, y que elegir `initials`/`preset` pide borrar la imagen subida
- [X] T018 [US1] Tests de integración de `GET/PATCH/DELETE /api/v1/me/profile` en `backend/tests/integration/test_profile.py` contra el emulador: 401 sin token; 403 (`access_denied`) sin cuenta y con cuenta revocada; 200 con valores por defecto sin documento; actualización parcial; 422 por valor desconocido, campo extra, nombre de 51 caracteres o con caracteres de control; que un 422 no guarda nada (atomicidad); 200 con `display_name: null` o vacío tras recortar (vuelve al nombre de Google); elegir `preset` válido e inválido; intentar fijar `upload` ⇒ 422; restablecer sin tocar nombre ni avatar; que el nombre con HTML se devuelve literal; y que tras cambiar `display_name` no varían `GET /api/v1/me` (correo, rol) ni `GET /api/v1/admin/access` (FR-017)
- [X] T019 [P] [US1] Tests de aislamiento en `backend/tests/integration/test_profile_isolation.py`: dos cuentas no ven ni cambian el perfil de la otra, ningún parámetro del cliente (cuerpo, consulta o ruta) puede apuntar a otro `uid`, y una cuenta revocada conserva su perfil tras reactivarla
- [X] T020 [P] [US2] Tests de integración de los parámetros nuevos en `backend/tests/integration/test_tasks_list_board.py` y `test_tasks_list_history.py`: `order=newest|oldest` solo con `view=board`, `within_days=30|90` solo con `view=history`, valores inválidos ⇒ 422, ignorados con otra `view`, sin parámetro ⇒ comportamiento actual, la paginación por cursor del historial sigue funcionando con `within_days`, y la consulta no requiere índice nuevo en el emulador
- [X] T021 [P] Test de los eventos de registro en `backend/tests/unit/test_logging_config.py` y `backend/tests/integration/test_audit_logging.py`: `profile_updated` y `profile_reset` llevan solo `uid` y los **nombres** de los campos cambiados, nunca el nombre para mostrar ni valores

### Implementación de la Fase 2

- [X] T022 [US1] Implementar `backend/src/mytasks_api/domain/profile.py` (valores permitidos y por defecto, catálogo de avatares, validación del nombre, reglas de transición del avatar) hasta que pasen T015
- [X] T023 [P] [US1] Implementar `backend/src/mytasks_api/schemas/profile.py` (`ProfileOut`, `AvatarOut`, `ProfileUpdateIn` con `extra="forbid"` y al menos un campo) conforme a `contracts/profile.yaml`
- [X] T024 [US1] Implementar `backend/src/mytasks_api/repositories/profile_repository.py`: leer con valores por defecto, actualizar con `set(merge=True)` en una sola escritura, restablecer, y aplicar el cambio de avatar (`initials`/`preset`) en una transacción que sube `avatar_version` y borra `users/{uid}/settings/avatar` si existe
- [X] T025 [US1] Implementar `backend/src/mytasks_api/services/profile_service.py` (con `get_profile_service`) hasta que pasen T017
- [X] T026 [US1] Implementar `backend/src/mytasks_api/routers/profile.py` (`GET/PATCH/DELETE /api/v1/me/profile`, todos con `Depends(get_active_user)`: el `uid` sale solo del token) y registrarlo en `backend/src/mytasks_api/factory.py`; hasta que pasen T018 y T019
- [X] T027 [US2] Añadir `order` a `sort_board` en `backend/src/mytasks_api/domain/task.py` y propagarlo por `backend/src/mytasks_api/services/task_service.py` y `routers/tasks.py` (`order: Literal["oldest","newest"] = "oldest"`, solo para `view=board`)
- [X] T028 [US2] Añadir `within_days` a `list_history` en `backend/src/mytasks_api/repositories/task_repository.py` (`completed_at >= ahora − N días`, sobre el campo ya ordenado e indexado), a `task_service.py` y a `routers/tasks.py` (`within_days: Literal[30, 90] | None`), hasta que pasen T016 y T020
- [X] T029 Añadir los eventos `profile_updated` y `profile_reset` a `backend/src/mytasks_api/logging_config.py` (lista cerrada de campos) y emitirlos desde el servicio, hasta que pase T021
- [X] T030 Verificar que `GET /openapi.json` de la API coincide con `contracts/profile.yaml` (rutas, esquemas, códigos de respuesta y los dos parámetros de `/tasks`) ampliando `backend/tests/unit/test_export_openapi.py`; corregir el contrato o el código hasta que coincidan
- [X] T031 Ejecutar `ruff check`, `ruff format --check`, `mypy` y toda la suite de backend (incluidos los umbrales de rendimiento de la 001) con los emuladores, y dejarlos en verde
- [X] T032 Revisión de seguridad de la Fase 2 con `mytasks-security-auditor` (autorización en cada endpoint, aislamiento por `uid`, validación atómica, nombre como texto plano, registros sin datos personales, parámetros nuevos de `/tasks`) y registrar el informe en `specs/004-user-profile-settings/security-review-fase-2.md`; corregir lo que marque como medio o superior en esta misma PR
- [X] T033 Marcar T015–T032 como hechas en este fichero y anotar el avance de la fase

**Checkpoint**: la API de perfil funciona de extremo a extremo con los emuladores y sin cambios de
comportamiento para nadie que no la use.

**Avance (2026-10-24)**: Fase 2 completa (T015–T033). Informe de seguridad en
[security-review-fase-2.md](./security-review-fase-2.md): sin críticos ni altos; MED-001 corregido
en la PR; LOW-001 a LOW-003 al backlog (LOW-002 es requisito de la Fase 5). El test unitario del
dominio se llama `test_profile_domain.py` para no chocar con el de integración.

---

## Phase 3: Apariencia: tema y densidad (US1) 🎯 MVP

**Purpose**: la sección `/perfil` con la apariencia y los tokens que hacen posible el tema oscuro y
la densidad compacta. Agente: `mytasks-frontend-developer`. **Requiere** las Fases 1 (aprobada) y 2
fusionadas.

**Goal**: la persona abre «Perfil», elige tema (claro, oscuro, sistema) y densidad, la aplicación
entera cambia al instante, se conserva entre sesiones y dispositivos, y al abrir la aplicación no
hay destello del tema contrario.

**Independent Test**: con una cuenta activa, elegir «Oscuro» y «Compacta», recargar con la red
limitada, cerrar sesión, volver a entrar y abrir desde otro navegador: todo sigue igual y nunca se
ve el tema claro antes. Además, la comprobación axe pasa en las pantallas en ambos temas.

### Diseño pendiente de la ronda 1 (tablero oscuro y compacto)

- [X] T109 Con el MCP de Stitch, generar **S3 Tablero v2 claro móvil**, **S3 oscuro** (escritorio y móvil), **S3 compacto** (claro, escritorio y móvil, con al menos un 25 % más de tareas visibles, SC-005) y **S7 Perfil oscuro móvil**, con los prompts de `docs/design/screens/prompts-004.md`; esperar a que Stitch los coloque, revisar las capturas, exportarlas a `docs/design/screens/` y anotarlas en `docs/design/screens/README.md`. Sin ellas, T040, T044 y T047 (densidad y tema oscuro del tablero) no tienen referencia
- [X] T110 (propietario) Aprobar las pantallas de T109 y registrar la pantalla vigente de cada una en `docs/design/screens/README.md`

### Tests de la Fase 3 (escribirlos primero; deben fallar)

- [X] T034 [P] [US1] Tests unitarios de `frontend/src/lib/appearance.ts` en `frontend/tests/unit/lib/appearance.test.ts`: resolver `system` con `matchMedia`, aplicar `data-theme` y `data-density` a `<html>`, leer y escribir la caché `mytasks.appearance`, y que sin `localStorage` (excepción al leer o escribir) cae en «sistema» y «cómoda» sin lanzar
- [X] T035 [P] [US1] Tests unitarios de `frontend/public/theme-init.js` en `frontend/tests/unit/public/theme-init.test.ts`: aplica los atributos con una caché válida, con una caché corrupta o con valores desconocidos usa los de por defecto, y funciona sin `localStorage`
- [X] T036 [P] [US1] Tests unitarios de los hooks de `frontend/src/api/profile.ts` en `frontend/tests/unit/api/profile.test.tsx`: `useProfile` (un único reintento ante fallo, como `useAccount`, y recarga al volver a la pestaña), `useUpdateProfile` (actualización optimista y vuelta atrás al fallar) y `useResetProfile`
- [X] T037 [P] [US1] Tests unitarios de `useAppearance` en `frontend/tests/unit/features/profile/useAppearance.test.tsx`: aplica el perfil al cargarlo, sigue en vivo el cambio del tema del sistema solo si el tema es `system`, y actualiza la caché
- [X] T038 [US1] Tests de `ProfilePage` y `AppearanceSection` en `frontend/tests/unit/features/profile/ProfilePage.test.tsx`: estados de carga, error al cargar (la aplicación sigue con los valores por defecto), guardando, «Guardado» (`role="status"`), error al guardar con «Reintentar» y control devuelto al valor guardado, «Restablecer valores por defecto» con confirmación, y navegación por teclado y nombres accesibles de los controles segmentados
- [X] T039 [P] [US1] Tests de la cabecera y la ruta en `frontend/tests/unit/app/AppHeader.test.tsx` y `ProtectedRoute.test.tsx`: enlace «Perfil», `/perfil` solo con cuenta activa y redirección al login sin sesión
- [X] T040 [P] [US1] Dos tests de estilos: (a) comportamiento compacto en `frontend/tests/unit/features/board/density.test.tsx` (con `data-density="compact"` las tarjetas usan las variables de espaciado compactas) y (b) protección del tema claro en `frontend/tests/unit/styles/tokens.test.ts`, que compara cada variable clara de `frontend/src/index.css` con el valor hexadecimal original de `frontend/tailwind.config.ts` (instantánea escrita **antes** de T044), para que quien no toque su perfil no vea ningún cambio de color (FR-004, SC-009)
- [X] T041 [US1] Tests e2e en `frontend/tests/e2e/profile-appearance.spec.ts` (escenarios 1–3, 14 y 16 de la quickstart): cambiar a oscuro, que persiste tras recargar y tras cerrar sesión y volver a entrar, que el atributo `data-theme` ya está en `<html>` al terminar de parsear el documento (sin destello), «Sistema» sigue el tema del navegador, compacta muestra más tareas, fallo del backend con «Reintentar», y que una cuenta sin perfil ve la aplicación como antes
- [X] T042 [P] [US1] Ampliar `frontend/tests/e2e/a11y.spec.ts` para ejecutar axe sobre `/`, `/historial`, `/papelera`, `/perfil`, `/admin/access` y «Necesitas una invitación» en tema claro **y** oscuro (cierra el pendiente de la 003: axe no cubría `/admin/access`)

### Implementación de la Fase 3

- [X] T043 [US1] Añadir los tipos del perfil (`Profile`, `ProfileUpdate`, `Avatar`, valores permitidos) a `frontend/src/api/types.ts` y crear `frontend/src/api/profile.ts` (`getProfile`, `updateProfile`, `resetProfile` y los hooks `useProfile` con clave `['profile']`, `retry: 1` y `refetchOnWindowFocus` explícito, `useUpdateProfile`, `useResetProfile`), hasta que pase T036
- [X] T044 [US1] Pasar los colores de `frontend/tailwind.config.ts` a variables CSS (`rgb(var(--color-…) / <alpha-value>)`) y definir en `frontend/src/index.css` los valores claros (los actuales) en `:root`, los oscuros **aprobados en la Fase 1** en `:root[data-theme='dark']`, las variables de espaciado de las tarjetas para `data-density` y `color-scheme`; añadir los tokens `on-primary` y `on-accent` (valen `#FFFFFF` en claro, así que no cambia nada) y **sustituir por tokens las clases con color literal** que hoy no cambiarían en oscuro (`bg-white`, `text-white`, `bg-text`, `border-blue-200`, `border-slate-200`, `border-red-200`, `border-amber-200`, `border-purple-200`, `border-teal-200`, `bg-teal-50`; ver `docs/design/DESIGN.md` § Tema oscuro), cuidando que el valor claro resultante sea idéntico al actual (lo protege el test de T040)
- [X] T045 [US1] Crear `frontend/src/lib/appearance.ts` y `frontend/public/theme-init.js` (mismo algoritmo, sin dependencias, con `try/catch`) y cargar el script de forma **síncrona** en el `<head>` de `frontend/index.html`, hasta que pasen T034 y T035
- [X] T046 [US1] Crear `frontend/src/features/profile/useAppearance.ts` y montarlo en `frontend/src/app/App.tsx` para que aplique el perfil, siga el tema del sistema y mantenga la caché, hasta que pase T037
- [X] T047 [US1] Hacer que las tarjetas y cuadrantes del tablero usen las variables de espaciado de la densidad en `frontend/src/features/board/TaskCard.tsx` y `Quadrant.tsx` (sin cambiar el aspecto de la densidad cómoda), hasta que pase T040
- [X] T048 [US1] Crear `frontend/src/features/profile/ProfilePage.tsx` y `AppearanceSection.tsx` según la pantalla S7 aprobada (tema, densidad y «Restablecer valores por defecto» con `ConfirmDialog`), añadir la ruta `/perfil` dentro del layout protegido de `frontend/src/app/App.tsx` y un enlace «Perfil» provisional en `frontend/src/app/AppHeader.tsx` (la Fase 5 lo sustituye por avatar + nombre), hasta que pasen T038 y T039
- [X] T049 [US1] En `frontend/src/features/profile/ProfilePage.tsx` mostrar siempre el mensaje fijo «No se pudo guardar el cambio. Inténtalo de nuevo.» ante cualquier fallo al guardar (sin enseñar el texto del servidor; los códigos de avatar tienen el suyo en T096), y anunciar «Guardado» con `role="status"` y los errores con `role="alert"`; lo verifica T038
- [X] T050 [US1] Ejecutar `npm run lint`, `tsc`, `prettier --check`, `npm test` y `npm run test:e2e` (con los emuladores) y dejarlos en verde, incluidos los e2e de las features 001 y 003, y corregir los contrastes que axe marque en cualquiera de los dos temas
- [X] T051 Revisión de seguridad de la Fase 3 con `mytasks-security-auditor` (script externo y CSP sin relajar, caché local de apariencia, nombre y estados de error sin filtrar datos) y registrar el informe en `specs/004-user-profile-settings/security-review-fase-3.md`
- [X] T052 Marcar T034–T051 como hechas en este fichero y anotar el avance de la fase

**Checkpoint**: US1 completa y desplegable; es el **MVP** de la feature.

**Avance (2026-10-24)**: Fase 3 completa. El propietario aprobó las seis pantallas de la ronda 1b
(T110; ver `docs/design/screens/README.md`, § Aprobaciones · ronda 1b). Código y tests: 181 unitarios, 53 e2e (incluido axe en claro y oscuro de todas las pantallas), lint, formato
y tipos en verde. Informe de seguridad en
[security-review-fase-3.md](./security-review-fase-3.md): sin críticos, altos ni medios; LOW-001 y
LOW-002 al backlog. Si el propietario pide cambios al tablero oscuro o compacto, se ajustan
`frontend/src/index.css` y `TaskCard.tsx`.

---

## Phase 4: Tablero por defecto, orden e historial (US2)

**Purpose**: que la aplicación se abra con el ámbito, el orden y el periodo del historial elegidos.
Agente: `mytasks-frontend-developer`. Requiere la Fase 3 fusionada (reutiliza la página y los hooks
de perfil).

**Goal**: la persona fija «Laboral» como tablero por defecto, «Más recientes primero» y «Últimos 30
días», y la aplicación se abre así sin pasos extra; cambiar el filtro en una visita no toca el perfil.

**Independent Test**: con tareas laborales y personales, fijar «Laboral», cerrar sesión, volver a
entrar y comprobar el tablero filtrado; cambiar el filtro a «Personal», volver a abrir y ver que
vuelve a «Laboral».

### Diseño pendiente de la ronda 2 (S4, S5, S6 y S1 móvil)

- [X] T111 Con el MCP de Stitch, generar las versiones nuevas de **S5 Historial** (con la franja «Mostrando solo los últimos N días · Ver todo»), **S4 Formulario de tarea** y **S6 Papelera** en claro y oscuro (escritorio y móvil), y **S1 Iniciar sesión oscuro móvil**, con los prompts de `docs/design/screens/prompts-004.md`; esperar a que Stitch los coloque, revisar las capturas, exportarlas a `docs/design/screens/` y anotarlas en `docs/design/screens/README.md`
  - Avance (2026-10-24): las pantallas ya estaban en el lienzo (no se generó nada). Exportadas y revisadas 11 de 14 (S5, S4, S6 y S1 en escritorio; S6 y S4/S1 oscuras); **faltan por exportar a mano desde Stitch** S5 v2 móvil, S5 oscuro móvil y S4 v2 móvil, cuyas URLs exigen credenciales (ver `docs/design/screens/README.md`, § Ronda 2). El propietario decidió seguir sin ellas (2026-10-24): T111 se da por hecha con esa salvedad.
- [X] T112 (propietario) Aprobar las pantallas de T111 (ronda 2 del punto de control) y registrar la pantalla vigente de cada una en `docs/design/screens/README.md`

### Tests de la Fase 4 (escribirlos primero; deben fallar)

- [X] T053 [P] [US2] Tests unitarios en `frontend/tests/unit/features/board/BoardPage.test.tsx`: el tablero no pide tareas hasta que el perfil se resuelve (éxito o error); al llegar el perfil fija el ámbito **una sola vez** (una recarga del perfil no lo cambia); un cambio manual del filtro no llama a `PATCH`; con error de perfil (tras su único reintento) usa «Todas» y no deja el tablero esperando; y pasa `order` a la petición
- [X] T054 [P] [US2] Tests unitarios en `frontend/tests/unit/features/history/HistoryPage.test.tsx`: con `history_days = 30` pide `within_days=30` y muestra «Mostrando solo los últimos 30 días · Ver todo»; «Ver todo» vuelve a pedir sin parámetro solo en esa visita; sin periodo no hay franja; periodo que deja el historial vacío muestra el aviso y no una pantalla en blanco
- [X] T055 [P] [US2] Tests unitarios de `BoardPreferences` en `frontend/tests/unit/features/profile/BoardPreferences.test.tsx`: tablero por defecto, orden y periodo guardan al elegir, con «Guardado» y vuelta atrás si falla, y el texto auxiliar de que las fijadas van siempre arriba
- [X] T056 [US2] Tests e2e en `frontend/tests/e2e/profile-board.spec.ts` (escenarios 4–6 de la quickstart): ámbito por defecto tras reabrir, filtro puntual que no persiste, orden más reciente primero con las fijadas arriba, periodo del historial con «Ver todo», y un tablero por defecto sin tareas en ese ámbito que muestra el estado vacío habitual

### Implementación de la Fase 4

- [X] T057 [US2] Añadir `order` y `within_days` a `frontend/src/api/tasks.ts` (claves de consulta incluidas) y al tipo correspondiente en `frontend/src/api/types.ts`
- [X] T058 [US2] Hacer que `frontend/src/features/board/BoardPage.tsx` espere al perfil (éxito, o error tras su único reintento; nunca más allá de eso, FR-026) y fije el ámbito inicial una sola vez mediante `frontend/src/stores/uiStore.ts` (con un estado «ya inicializado» que sobrevive a las recargas del perfil), y que use `order` del perfil, hasta que pase T053
- [X] T059 [US2] Hacer que `frontend/src/features/history/HistoryPage.tsx` use `within_days` del perfil y muestre la franja con «Ver todo» (solo por visita), según la pantalla S5 aprobada, hasta que pase T054
- [X] T060 [US2] Crear `frontend/src/features/profile/BoardPreferences.tsx` (tablero por defecto, orden, periodo del historial) y montarlo en `ProfilePage.tsx`, hasta que pasen T055 y T056
- [X] T061 [US2] Ejecutar `npm run lint`, `tsc`, `prettier --check`, `npm test` y `npm run test:e2e` y dejarlos en verde
- [X] T062 Marcar T053–T061 como hechas en este fichero y anotar el avance de la fase

**Checkpoint**: US1 y US2 funcionan juntas y por separado.

**Avance (2026-10-24)**: Fase 4 completa. El propietario aprobó las pantallas de la ronda 2 (T112;
`docs/design/screens/README.md`, § Aprobaciones · ronda 2; S5 v2 móvil, S5 oscuro móvil y S4 v2 móvil
quedaron sin exportar por decisión suya). Código y tests: 212
unitarios, 57 e2e, lint, formato y tipos en verde. El tablero espera al perfil (éxito, o error tras
su único reintento) y fija el ámbito una sola vez; el historial aplica el periodo con la franja y
«Ver todo» solo por visita; el estado de la interfaz se reinicia al cambiar de persona.

---

## Phase 5: Nombre para mostrar y avatar predefinido (US3)

**Purpose**: identidad visual de la persona sin subir archivos. Agente:
`mytasks-frontend-developer`. Requiere la Fase 3 fusionada y los avatares aprobados (Fase 1).

**Goal**: la cabecera muestra el avatar (iniciales por defecto) y el nombre elegidos, enlazados a
«Perfil»; se elige un avatar del catálogo o se quita; el nombre se valida y se puede volver al de
Google.

**Independent Test**: en «Perfil», escribir un nombre, elegir un avatar del catálogo, comprobar la
cabecera, quitar el avatar y ver las iniciales; probar nombre vacío, de 51 caracteres y con HTML.

### Diseño pendiente de la ronda 2 (selector de avatar)

- [X] T113 Con el MCP de Stitch, generar el **selector de avatar y el recortador** (claro y oscuro, escritorio y móvil, con el catálogo de los 12 avatares dentro) según `contracts/ui-screens.md` y `docs/design/screens/prompts-004.md`; esperar a que Stitch los coloque (unos 45-60 minutos; no reintentar tras un *timeout*), revisar las capturas, exportarlos a `docs/design/screens/s7-avatar-picker*/` y anotarlos en `docs/design/screens/README.md`
- [ ] T114 (propietario) Aprobar el selector, el recortador y el catálogo de avatares (ronda 2 del punto de control) y registrar la pantalla vigente en `docs/design/screens/README.md`

### Tests de la Fase 5 (escribirlos primero; deben fallar)

- [ ] T063 [P] [US3] Tests unitarios de `frontend/src/features/profile/avatars.ts` y `initials.ts` en `frontend/tests/unit/features/profile/avatars.test.ts`: exactamente 12 identificadores `avatar-01…12` con nombre accesible no vacío (y que coinciden con los del contrato), e iniciales de uno o varios nombres, con acentos, con emojis y signos, de un correo, y color determinista por `uid`
- [ ] T064 [P] [US3] Tests unitarios de `Avatar` en `frontend/tests/unit/features/profile/Avatar.test.tsx`: iniciales, catálogo (con texto alternativo) y estado de carga; nunca un hueco vacío
- [ ] T065 [P] [US3] Tests unitarios de `IdentitySection` en `frontend/tests/unit/features/profile/IdentitySection.test.tsx`: validación de 1–50 caracteres tras recortar con el contador, mensaje claro y valor anterior conservado, «Usar el de Google» (con el nombre que se usará), texto plano ante `<img onerror>`, «Quitar avatar» solo si hay uno, y que la pantalla de administración de accesos sigue mostrando el correo y no el nombre elegido (FR-017)
- [ ] T066 [P] [US3] Tests unitarios de `AvatarPicker` (solo catálogo) en `frontend/tests/unit/features/profile/AvatarPicker.test.tsx`: rejilla accesible por teclado, seleccionado visible más allá del color, y foco devuelto al cerrar
- [ ] T067 [P] [US3] Test de la cabecera en `frontend/tests/unit/app/AppHeader.test.tsx`: avatar + nombre efectivo (perfil → Google → correo) como un único enlace «Perfil de <nombre>», nombre largo recortado, y en móvil solo el avatar
- [ ] T068 [US3] Tests e2e en `frontend/tests/e2e/profile-identity.spec.ts` (escenarios 7 y 8 de la quickstart): nombre en la cabecera, validaciones, HTML como texto literal, elegir y quitar avatar y que persiste entre sesiones

### Implementación de la Fase 5

- [ ] T069 [P] [US3] Crear los 12 SVG del catálogo en `frontend/src/assets/avatars/avatar-01.svg … avatar-12.svg` a partir del diseño aprobado en la Fase 1 (legibles a 32 px, válidos en ambos temas)
- [ ] T070 [US3] Crear `frontend/src/features/profile/avatars.ts` (catálogo con nombres en español) y `initials.ts`, hasta que pase T063
- [ ] T071 [US3] Crear `frontend/src/features/profile/Avatar.tsx` (iniciales, catálogo; la imagen subida llega en la Fase 6), hasta que pase T064
- [ ] T072 [US3] Crear `frontend/src/features/profile/IdentitySection.tsx` y `AvatarPicker.tsx` (solo pestaña «Catálogo» por ahora) y montarlos en `ProfilePage.tsx`, hasta que pasen T065, T066 y T068
- [ ] T073 [US3] Sustituir el enlace provisional de `frontend/src/app/AppHeader.tsx` por avatar + nombre enlazados a `/perfil` según la cabecera aprobada, hasta que pase T067
- [ ] T074 [US3] Ejecutar `npm run lint`, `tsc`, `prettier --check`, `npm test` y `npm run test:e2e` (incluido axe en ambos temas con los avatares) y dejarlos en verde
- [ ] T075 Marcar T063–T074 como hechas en este fichero y anotar el avance de la fase

**Checkpoint**: US1, US2 y US3 funcionan; la aplicación ya ofrece un perfil completo sin subir archivos.

---

## Phase 6: Subir mi propia imagen de avatar (US4)

**Purpose**: la parte más sensible de la feature (archivos de personas). Agentes:
`mytasks-backend-developer` (T076–T088) y `mytasks-frontend-developer` (T089–T100); revisión
obligatoria de `mytasks-security-auditor`. Requiere la Fase 5 fusionada.

**Goal**: la persona sube una imagen válida, la encuadra, la ve como avatar, la sustituye o la
quita; una imagen inválida o excesiva se rechaza con un mensaje claro sin tocar la anterior; y la
imagen solo la ve su dueña.

**Independent Test**: subir una JPEG, sustituirla por una PNG, quitarla; probar un archivo de texto
renombrado a `.png`, uno de más de 2 MB y una imagen con coordenadas EXIF (el resultado guardado no
las lleva); y comprobar con el token de otra cuenta que nunca se sirve la imagen ajena.

### Tests de la Fase 6 (escribirlos primero; deben fallar)

- [ ] T076 [P] [US4] Tests unitarios del procesado de imagen en `backend/tests/unit/domain/test_avatar_image.py` con imágenes generadas en el propio test: JPEG, PNG y WebP válidos ⇒ WebP 256×256 sin metadatos; no cuadrada ⇒ recorte centrado; orientación EXIF aplicada y datos EXIF eliminados; PNG con transparencia y paleta; texto, HTML y SVG renombrados a `.png` ⇒ rechazo; archivo corrupto o truncado ⇒ rechazo; GIF y TIFF ⇒ rechazo; **bomba de descompresión** (PNG de dimensiones enormes y pocos bytes) ⇒ rechazo antes de decodificar; entrada > 2 MB ⇒ rechazo; salida ≤ 200 KB
- [ ] T077 [P] [US4] Tests unitarios del límite de subidas en `backend/tests/unit/domain/test_profile_domain.py`: 10 por ventana de 1 hora, la número 11 se rechaza con los segundos restantes, la ventana se reinicia al expirar, y quitar el avatar no cuenta
- [ ] T078 [P] [US4] Tests del repositorio en `backend/tests/unit/repositories/test_profile_repository_retry.py`: la subida (documento `avatar` + `profile` + contador) es atómica y reintenta ante `Aborted` como el resto de transacciones del proyecto
- [ ] T079 [US4] Tests de integración de `PUT/GET/DELETE /api/v1/me/avatar` en `backend/tests/integration/test_avatar.py`: 401, 403 (sin cuenta y revocada), 200 con cada formato, 413 por tamaño (por `Content-Length` y por lectura sin ella), 415 por tipo o contenido inválido, 429 con `Retry-After` en la subida 11, sustituir deja **un solo** documento `avatar`, `avatar_version` sube en cada cambio, `GET` devuelve `image/webp` con `X-Content-Type-Options: nosniff` y `Cache-Control: private, max-age=31536000, immutable`, 404 sin imagen, `DELETE` idempotente que no cuenta para el límite, y elegir `preset` o `initials` borra la imagen
- [ ] T080 [P] [US4] Tests de aislamiento del avatar en `backend/tests/integration/test_profile_isolation.py`: cada cuenta obtiene solo su imagen, no existe ninguna ruta o parámetro que acepte un `uid`, y una cuenta revocada recibe 403 pero conserva su imagen
- [ ] T081 [P] [US4] Test de los eventos `avatar_uploaded` y `avatar_removed` en `backend/tests/integration/test_audit_logging.py`: solo `uid` y tamaño final, nunca contenido, nombre de archivo ni metadatos

### Implementación del backend de la Fase 6

- [ ] T082 [US4] Añadir `pillow` a `backend/pyproject.toml` y regenerar `backend/uv.lock` (versión fijada), y comprobar que la imagen del backend se construye con `pack` según `dev-env-sandbox-notes` (Principio III: dependencias fijadas)
- [ ] T083 [US4] Implementar `backend/src/mytasks_api/domain/avatar_image.py` (identificación por contenido, tope de píxeles previo a decodificar, orientación, recorte, 256×256, WebP, sin metadatos) y el límite de subidas en `backend/src/mytasks_api/domain/profile.py`, hasta que pasen T076 y T077
- [ ] T084 [US4] Ampliar `backend/src/mytasks_api/repositories/profile_repository.py` con la subida, lectura y borrado del avatar en transacción, hasta que pase T078
- [ ] T085 [US4] Ampliar `backend/src/mytasks_api/services/profile_service.py` y `routers/profile.py` con `GET/PUT/DELETE /api/v1/me/avatar`: cuerpo binario leído con tope duro de 2 MB (`Content-Length` y corte de la lectura), cabeceras de la respuesta del `GET`, y `Depends(get_active_user)` en todos
- [ ] T086 [US4] Registrar en `backend/src/mytasks_api/factory.py` los errores `avatar_too_large` (413), `avatar_unsupported` (415) y `avatar_rate_limited` (429 con `Retry-After`) y emitir `avatar_uploaded` y `avatar_removed` desde `logging_config.py`, hasta que pasen T079, T080 y T081
- [ ] T087 [US4] Ampliar `backend/tests/unit/test_export_openapi.py` para que `GET /openapi.json` coincida también con los endpoints de avatar de `contracts/profile.yaml`
- [ ] T088 [US4] Ejecutar `ruff check`, `ruff format --check`, `mypy` y la suite de backend completa, y dejarlos en verde

### Tests del frontend de la Fase 6 (escribirlos primero; deben fallar)

- [ ] T089 [P] [US4] Tests unitarios de `AvatarCropper` en `frontend/tests/unit/features/profile/AvatarCropper.test.tsx`: arrastre y zoom con ratón, táctil y **teclado**, vista previa redonda, resultado cuadrado exportado como `Blob` de tipo imagen, y cancelar sin subir nada
- [ ] T090 [P] [US4] Tests unitarios de `useAvatarUrl` y las mutaciones en `frontend/tests/unit/api/profile.test.tsx`: descarga con `Authorization`, crea un `blob:` URL, lo revoca al cambiar la versión o desmontar, y usa `?v=<version>`
- [ ] T091 [P] [US4] Tests unitarios del selector en `frontend/tests/unit/features/profile/AvatarPicker.test.tsx` (pestaña «Subir imagen»): rechazo en el cliente de tipo y de tamaño antes de enviar, mensajes de 413/415/429 («Espera unos minutos») y del fallo de red, estado «subiendo», y que el avatar anterior se conserva ante cualquier error
- [ ] T092 [P] Test de la CSP en `frontend/nginx/tests/test-runtime-config.sh`: `img-src 'self' data: blob:` y que el resto de directivas queda igual
- [ ] T093 [US4] Tests e2e en `frontend/tests/e2e/profile-avatar.spec.ts` (escenarios 9–13 de la quickstart): subir, encuadrar, sustituir y quitar; archivos inválidos; la imagen sigue tras recargar (sin errores de CSP en la consola); y el límite de subidas

### Implementación del frontend de la Fase 6

- [ ] T094 [US4] Ampliar `frontend/src/api/profile.ts` con `uploadAvatar` (cuerpo binario con su `Content-Type`), `removeAvatar` y `useAvatarUrl`, y permitir cuerpos no JSON en `frontend/src/lib/apiClient.ts` sin cambiar el comportamiento actual, hasta que pase T090
- [ ] T095 [US4] Crear `frontend/src/features/profile/AvatarCropper.tsx` con `<canvas>` (sin librerías), accesible por teclado, que exporta un cuadrado de hasta 512 px, hasta que pase T089
- [ ] T096 [US4] Añadir la pestaña «Subir imagen» a `AvatarPicker.tsx` y el estado `upload` a `Avatar.tsx`, con los mensajes de error en `apiClient.ts` (`avatar_too_large`, `avatar_unsupported`, `avatar_rate_limited`), hasta que pasen T091 y T093
- [ ] T097 [US4] Añadir `blob:` a `img-src` en `frontend/nginx/docker-entrypoint.d/40-runtime-config.sh`, hasta que pase T092
- [ ] T098 [US4] Vaciar y revocar los `blob:` URL del avatar al cambiar de usuario o cerrar sesión (extendiendo `frontend/src/app/SessionCacheReset.tsx`) y probarlo en `frontend/tests/unit/app/SessionCacheReset.test.tsx`
- [ ] T099 [US4] Ejecutar `npm run lint`, `tsc`, `prettier --check`, `npm test` y `npm run test:e2e` (con axe en ambos temas) y dejarlos en verde
- [ ] T100 Revisión de seguridad de la Fase 6 con `mytasks-security-auditor` (bombas de descompresión, *polyglots*, EXIF, tamaños, límite, caché y `nosniff`, cambio de `img-src`, aislamiento entre cuentas, `blob:` URL) y registrar el informe en `specs/004-user-profile-settings/security-review-fase-6.md`; corregir lo que marque como medio o superior en esta misma PR
- [ ] T101 Marcar T076–T100 como hechas en este fichero y anotar el avance de la fase

**Checkpoint**: las cuatro historias funcionan; subir una imagen no necesita ningún cambio de infraestructura.

---

## Phase 7: Documentación y cierre

**Purpose**: dejar el contrato, la documentación operativa y los diseños coherentes con lo
construido, y cerrar la revisión de seguridad. Agentes: `mytasks-backend-developer`,
`mytasks-frontend-developer` y `mytasks-security-auditor`.

**Goal**: la feature está lista para staging y para producción, con contrato único, documentación al
día, revisión de seguridad final y *Definition of Done* repasada.

**Independent Test**: el contrato de 001 contiene los endpoints de perfil y coincide con
`GET /openapi.json`; el `README.md` y `docs/design/screens/README.md` describen lo vigente.

- [ ] T102 [P] Integrar `contracts/profile.yaml` en `specs/001-eisenhower-task-manager/contracts/openapi.yaml` (versión 1.3.0: endpoints `/me/profile` y `/me/avatar`, parámetros `order` y `within_days`, esquemas y respuestas 413/415/429) y comprobarlo contra `GET /openapi.json` como se hizo en la 003; dejar una nota en `contracts/profile.yaml` de que ya está integrado
- [ ] T103 [P] Actualizar `README.md` (qué ofrece «Perfil», dónde viven las preferencias y el avatar, y que no hay variables nuevas) y `infra/RUNBOOK.md` (sección breve: sin cambios de infraestructura, cómo comprobar el avatar en `users/{uid}/settings/avatar`, qué hacer si una persona sube algo inadecuado —borrar el documento `avatar` y poner `avatar_kind = initials` a mano—, y la nota de `img-src` con `blob:`)
- [ ] T104 [P] Anotar en `specs/001-eisenhower-task-manager/data-model.md`, `spec.md` y `plan.md` que la feature 004 añade preferencias y avatar bajo `users/{uid}/settings/`, y comprobar que `docs/design/screens/README.md` indica la pantalla vigente de cada una
- [ ] T105 Revisión de seguridad **final** de la feature con `mytasks-security-auditor` (estado acumulado de los hallazgos de las Fases 2, 3 y 6, riesgo residual del tema en `localStorage` en equipos compartidos, y la documentación) y registrar el informe en `specs/004-user-profile-settings/security-review-final.md`
- [ ] T106 Repasar el checklist *Definition of Done* de la constitución para la feature completa y registrar el resultado en `specs/004-user-profile-settings/definition-of-done.md`
- [ ] T107 (propietario) Validar en staging, ya desplegado por el pipeline, los escenarios 1, 4, 7, 9, 12 y 16 de [quickstart.md](./quickstart.md) con cuentas reales, comprobar que la consola del navegador no muestra errores de CSP, y anotar el resultado en `specs/004-user-profile-settings/validacion-staging.md`
- [ ] T108 Marcar la feature como lista para release cuando T107 esté hecha y esta PR fusionada

---

## Dependencies & Execution Order

### Orden de las fases

- **Fase 1 (diseño)**: sin dependencias; termina en el punto de control T013.
- **Fase 2 (backend)**: sin dependencias; **puede ir en paralelo a la Fase 1**.
- **Fase 3 (US1)**: necesita la Fase 1 (ronda 1 del punto de control) aprobada y fusionada y la Fase 2
  fusionada. Es el MVP. La ronda 2 (S4, S5, S6, S1 oscuro y selector de avatar) puede aprobarse
  después, pero antes de las Fases 4 y 5.
- **Fase 4 (US2)** y **Fase 5 (US3)**: necesitan la Fase 3 fusionada; son independientes entre sí
  (pueden ir en paralelo si no se tocan los mismos ficheros: ambas modifican `ProfilePage.tsx`, así
  que se fusionan una detrás de otra).
- **Fase 6 (US4)**: necesita la Fase 5 fusionada (reutiliza el selector de avatar).
- **Fase 7 (cierre)**: necesita todas las anteriores.

```text
Fase 1 (diseño) ──┐
                  ├──▶ Fase 3 (US1, MVP) ──┬──▶ Fase 4 (US2) ──┐
Fase 2 (backend) ─┘                        └──▶ Fase 5 (US3) ──┴──▶ Fase 6 (US4) ──▶ Fase 7
```

### Dentro de cada fase

- Los tests se escriben primero y deben fallar antes de implementar.
- Dominio → repositorio → servicio → router (backend); API → hooks → componentes → páginas
  (frontend).
- Las tareas de revisión de seguridad y de marcado de avance cierran cada fase; una PR no se abre
  hasta que la suite de su fase está en verde.

### Oportunidades de paralelismo

- Fase 1 y Fase 2 completas, en dos ramas distintas.
- Dentro de la Fase 2: T015, T016, T017, T019, T020 y T021 (ficheros distintos); T023 en paralelo a
  T022.
- Dentro de las Fases 3 a 5, todos los tests marcados `[P]`.
- Dentro de la Fase 6, el backend (T076–T088) y los tests del frontend (T089–T093) en paralelo,
  porque el frontend se prueba con la API simulada hasta T094.

## Implementation Strategy

### MVP primero

1. Fase 1 y Fase 2 en paralelo (diseño aprobado + API de perfil).
2. Fase 3: **parar y validar** US1 (tema y densidad) en staging. Es útil por sí sola.
3. Fases 4 y 5 en el orden que convenga; cada una añade valor sin romper la anterior.
4. Fase 6 al final: es la más costosa y la menos necesaria (el catálogo ya cubre la necesidad
   básica de avatar).
5. Fase 7 y validación del propietario en staging antes de promover a producción.

### Riesgos conocidos

- **MCP de Stitch inestable** (Fase 1): se mitiga con prioridad de generación, `list_screens` antes
  de reintentar y aviso en el punto de control si una pantalla no sale.
- **Contraste en oscuro** (Fases 1 y 3): `check-contrast.py` en el diseño y axe en ambos temas en
  los e2e; un par que falle se corrige en la paleta, no en cada componente.
- **Destello de tema** (Fase 3): el script de arranque debe ser síncrono y externo; el e2e
  comprueba que el atributo está puesto antes de pintar.
- **Imágenes hostiles** (Fase 6): el servidor reprocesa siempre y nunca guarda el original; la
  revisión de seguridad de esa fase es bloqueante.
