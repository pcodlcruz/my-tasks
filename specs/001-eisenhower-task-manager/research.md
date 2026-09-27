# Research: Gestión de tareas con matriz de Eisenhower

**Feature**: `001-eisenhower-task-manager` | **Fecha**: 2026-09-27 | **Plan**: [plan.md](./plan.md)

El stack base (React + TypeScript + TanStack Query + Zustand + Vitest + Playwright; Python 3.12 +
FastAPI + pytest; Firestore) lo fija la constitución y no se re-decide aquí. Este documento
resuelve las incógnitas que la constitución y la spec dejan abiertas.

---

## R1. Mecanismo de autenticación y registro

- **Decision**: Firebase Authentication (Google Identity Platform) con **un único proveedor:
  "Iniciar sesión con Google"** (OAuth 2.0 / OpenID Connect). El sistema **no almacena ni gestiona
  contraseñas** en ningún sitio. El frontend usa el SDK web de Firebase Auth
  (`signInWithPopup` + `GoogleAuthProvider`) y envía el *ID token* de Firebase en
  `Authorization: Bearer <token>`; el backend lo verifica con `firebase-admin`
  (`auth.verify_id_token`) y usa el `uid` como identidad del usuario. En local se usa el
  **emulador de Auth** de Firebase, que simula el proveedor de Google sin contactar con Google.
- **Registro**: no hay pantalla ni flujo de registro separado. El primer inicio de sesión con
  Google crea la cuenta automáticamente (autoservicio, FR-001). Como la identidad es la cuenta de
  Google, no puede haber registros duplicados: volver a entrar con la misma cuenta de Google abre
  la misma cuenta de la aplicación (caso límite de la spec cubierto por construcción).
- **Rationale**: decisión del propietario (2026-09-27): no almacenar contraseñas. Delega en
  Google la custodia de credenciales, el MFA y la protección frente a fuerza bruta; elimina el
  registro, la recuperación de contraseña y las reglas de contraseña débil (menos código crítico
  de seguridad — Principios I y III). Cumple "Google Cloud exclusivamente" y tiene emulador local
  para los tests de integración y e2e (Principios II y IV).
- **Alternatives considered**:
  - *Firebase Auth con email + contraseña* (decisión anterior): las contraseñas no estarían en
    nuestra base de datos, pero sí en el proveedor, y exige registro, confirmación y reglas de
    contraseña; rechazado por decisión del propietario.
  - *Usuarios y contraseñas propios en Firestore*: más código crítico de seguridad que mantener;
    rechazado (Principio I y III).
  - *OAuth de Google directo (Google Identity Services) sin Firebase Auth*: obligaría a gestionar
    sesiones propias y no tiene emulador local; rechazado.
  - *Verificar tokens con `google-auth` en vez de `firebase-admin`*: no acepta los tokens sin
    firmar del emulador de Auth, lo que rompería los tests locales; rechazado.
- **Consecuencias**:
  - Requiere que cada usuario tenga una cuenta de Google (aceptado por el propietario).
  - Datos que se reciben de Google: `uid`, email y, opcionalmente, nombre y foto para la
    cabecera. No se piden *scopes* adicionales a los básicos (`openid`, `email`, `profile`).
  - Tests: en el emulador, el e2e inicia sesión con cuentas de Google ficticias
    (`GoogleAuthProvider.credential` con un ID token sin firmar que acepta el emulador) y los tests
    de integración del backend crean usuarios en el emulador y obtienen su ID token; ninguno
    contacta con Google.
- **Notas**:
  - Habilitar Identity Platform con el proveedor de Google en staging/producción (cliente OAuth,
    pantalla de consentimiento, dominios autorizados) es una operación de infraestructura: queda
    fuera de esta feature y la diseñará `mytasks-google-cloud-architect` y la aplicará
    `mytasks-google-cloud-operator` vía MCP (Principio V).

## R2. Modelo de almacenamiento en Firestore y aislamiento por usuario

- **Decision**: una subcolección por usuario: `users/{uid}/tasks/{taskId}`. El `uid` sale
  siempre del token verificado, nunca del cuerpo ni de la URL de la petición. No se crea documento
  `users/{uid}` (no hay atributos de usuario que guardar).
- **Rationale**: el aislamiento (FR-003, SC-002) queda garantizado por la ruta: el repositorio
  solo puede construir referencias bajo el `uid` autenticado. Una tarea de otro usuario
  simplemente no existe bajo esa ruta → `404`, sin revelar su existencia.
- **Alternatives considered**: colección global `tasks` con campo `owner_uid`: obliga a filtrar
  en cada consulta y un olvido filtra datos entre cuentas; rechazado.
- **Acceso directo desde el cliente**: el frontend **no** accede a Firestore; todo pasa por la
  API. Las *security rules* de Firestore se fijan en "denegar todo" (defensa en profundidad).

## R3. Papelera con purgado a los 30 días (FR-014b)

- **Decision**: al mover a la papelera se guardan `trashed_at` y `purge_at = trashed_at + 30 días`.
  El borrado físico lo hace una **política TTL de Firestore** sobre el campo `purge_at`. Como el
  TTL de Firestore puede tardar hasta ~24 h en ejecutarse tras el vencimiento, **todas las
  lecturas excluyen las tareas con `purge_at <= ahora`** y cualquier operación sobre ellas
  devuelve `404`: para el usuario, la tarea desaparece exactamente a los 30 días.
- **Rationale**: no requiere job programado (Cloud Scheduler + endpoint) ni código de purgado;
  el filtro en lectura hace el comportamiento exacto y testeable contra el emulador (que no
  ejecuta TTL).
- **Alternatives considered**: Cloud Scheduler + endpoint de purgado: más piezas, más
  permisos y un endpoint interno que proteger; rechazado (Principio I).
- **Nota**: la política TTL es configuración de infraestructura (staging/producción) y se crea
  por IaC en la feature de infraestructura, no en esta. Hasta entonces, el filtro en lectura
  garantiza el comportamiento funcional.

## R4. Consultas, ordenación y paginación

- **Decision**:
  - **Tablero**: `status == "active" AND in_trash == false`, sin paginar, ordenado en la capa de
    servicio (fijadas primero, luego `created_at` ascendente — FR-008a). El filtro por ámbito se
    aplica en la consulta (`scope ==`).
  - **Historial**: `status == "completed" AND in_trash == false`, orden `completed_at` desc,
    paginado por cursor.
  - **Papelera**: `in_trash == true AND purge_at > now`, orden `purge_at` desc (equivalente a
    `trashed_at` desc), paginada por cursor.
  - Los índices compuestos se declaran en `firestore.indexes.json` en el repo.
- **Rationale**: es una app personal; se asume un máximo de ~500 tareas activas por usuario
  (ver Scale/Scope en el plan), así que ordenar el tablero en memoria es trivial y evita otro
  índice compuesto. Historial y papelera crecen sin límite y se paginan con cursores de Firestore,
  como pide el skill de backend.
- **Alternatives considered**: guardar un campo `position` para ordenación manual: descartado
  en `/speckit-clarify` (se eligió orden por fecha + fijar).

## R5. Cuadrante derivado

- **Decision**: el cuadrante **no se almacena**; se calcula a partir de `urgent`/`important` en el
  dominio y se incluye en las respuestas de la API. El "cuadrante que tuvo" una tarea completada
  (FR-013) es el mismo cálculo, porque una tarea completada no se puede editar (FR-011).
- **Rationale**: una sola fuente de verdad; imposible que el cuadrante quede desincronizado
  (SC-005).

## R6. Concurrencia

- **Decision**: *last-write-wins* en ediciones de campos. Las **transiciones de estado**
  (completar, reabrir, mover a papelera, restaurar, borrar definitivamente) se ejecutan en una
  transacción de Firestore que relee el estado y rechaza con `409` la transición no válida
  (p. ej. completar una tarea ya completada desde otra pestaña).
- **Rationale**: un único usuario por cuenta; los conflictos reales son de dos pestañas. Bloqueo
  optimista con versiones sería complejidad no justificada.

## R7. Diseño de interfaz con Stitch (petición del usuario)

- **Decision**: los diseños de interfaz se hacen en **Stitch** mediante su MCP (`mcp__stitch__*`)
  **antes** de implementar el frontend:
  1. Crear un proyecto Stitch "MyTasks" y un *design system* a partir de
     `docs/design/DESIGN.md` (colores, tipografía, espaciado, estilo de los cuadrantes), que vive
     en el repo como fuente versionada.
  2. Generar una pantalla por cada entrada de [contracts/ui-screens.md](./contracts/ui-screens.md)
     (escritorio y móvil), incluidos estados vacíos y de error.
  3. **Punto de control humano**: el propietario revisa y aprueba las pantallas en Stitch antes
     de empezar las tareas de frontend.
  4. Exportar a `docs/design/screens/` el HTML y la captura de cada pantalla aprobada, como
     referencia versionada que usan las tareas de frontend.
- **Rationale**: el usuario lo pide explícitamente; tener las pantallas aprobadas antes de
  codificar evita rehacer componentes. Stitch no es Google Cloud, así que el Principio V no
  aplica.
- **Principio VIII**: ningún skill del proyecto cubre el diseño en Stitch; se hace manualmente
  y se justifica en la PR. La implementación de las pantallas en React sí se hace con
  `mytasks-frontend-developer`.

## R8. Estilos del frontend

- **Decision**: **Tailwind CSS**.
- **Rationale**: Stitch genera HTML con clases de Tailwind; usar Tailwind permite trasladar las
  pantallas aprobadas a componentes React casi 1:1, con máxima fidelidad y mínimo trabajo de
  traducción. Los *tokens* del design system (colores de cuadrante, tipografía) se definen una
  vez en la configuración de Tailwind.
- **Alternatives considered**: CSS Modules (sin dependencias extra): obligaría a reescribir a
  mano todo el estilo de cada pantalla de Stitch; rechazado por coste y riesgo de divergencia con
  el diseño aprobado.

## R9. Herramientas del proyecto

- **Decision**:
  - Backend: `uv` como gestor de dependencias y entornos (`uv.lock` fijado — Principio III),
    `ruff` (lint + formato), `mypy` en modo estricto.
  - Frontend: Vite, `npm` con `package-lock.json`, ESLint + Prettier, React Router para las
    rutas (login, tablero, historial, papelera).
  - Emuladores: Firebase Emulator Suite (`firebase-tools`) para Auth y Firestore, configurado en
    `firebase.json` en la raíz (requiere Java 11+).
  - e2e: Playwright contra frontend + backend + emuladores levantados en local.
- **Rationale**: lockfiles obligatorios por la constitución; `uv` es el gestor estándar actual
  y rápido de Python; un único `firebase.json` levanta los dos emuladores con un comando.

## R10. Fechas y zona horaria

- **Decision**: todas las fechas se guardan y viajan en UTC (ISO 8601); el frontend las muestra en
  la zona horaria del navegador.

## R11. Fuera de alcance de esta feature (explícito)

- Infraestructura en Google Cloud (Cloud Run u otro, Identity Platform, TTL, índices en proyectos
  reales), pipeline CI/CD y despliegue a staging/producción: requieren diseño de
  `mytasks-google-cloud-architect` y una feature propia. **Esta feature se entrega funcionando y
  testeada en local** (Principio IV).
- Notificaciones (ya excluidas en la spec). La recuperación de contraseña y la verificación de
  email dejan de aplicar: no hay contraseñas y Google ya verifica el email.
