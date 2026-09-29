# Contrato de interfaz: pantallas a diseñar en Stitch

**Feature**: `001-eisenhower-task-manager` | **Decisión**: [research.md § R7](../research.md#r7-diseño-de-interfaz-con-stitch-petición-del-usuario)

Cada pantalla de esta lista se diseña en Stitch (escritorio y móvil) y el propietario la aprueba
antes de implementarla. Las pantallas aprobadas se exportan a `docs/design/screens/<id>/`. Toda
la interfaz está en **español**. Objetivo de accesibilidad: **WCAG 2.1 AA**. Los cuadrantes no
se distinguen solo por color: cada uno lleva siempre su etiqueta de texto.

## Rutas

| Ruta | Pantalla | Requiere sesión |
|---|---|---|
| `/login` | S1 Iniciar sesión | No |
| `/` | S3 Tablero | Sí |
| `/historial` | S5 Historial | Sí |
| `/papelera` | S6 Papelera | Sí |

Si alguien entra sin sesión en una ruta que la requiere, se le redirige a `/login` y, tras
autenticarse, vuelve a la ruta original (FR-002).

## Pantallas

### S1 · Iniciar sesión (US1)
- Sin campos: una única acción, "Iniciar sesión con Google" (botón según las guías de marca de
  Google). Texto breve: la primera vez se crea la cuenta automáticamente. No hay contraseñas ni
  pantalla de registro.
- Estados: cargando (ventana de Google abierta), ventana cerrada por el usuario (vuelve al estado
  inicial sin error), error al iniciar sesión (mensaje genérico con "Reintentar"). Si va bien,
  entra al tablero (vacío la primera vez).

### S3 · Tablero (US2, US3, US4)
- Una cabecera con navegación (Tablero / Historial / Papelera), el usuario y "Cerrar sesión".
- Filtro de ámbito con tres opciones exclusivas: **Todas / Laboral / Personal** (un clic —
  SC-006). El filtro elegido se mantiene al navegar entre pantallas.
- Botón principal "Nueva tarea".
- Rejilla 2×2 con los cuatro cuadrantes, en el orden canónico de la matriz:
  "Hacer ahora" (arriba-izq.), "Planificar" (arriba-der.), "Delegar" (abajo-izq.), "Eliminar"
  (abajo-der.). En móvil: los cuatro apilados, con "Hacer ahora" primero (SC-004).
- Cada cuadrante muestra su número de tareas y, si no tiene ninguna, un estado vacío explícito
  (FR-009). Sin ninguna tarea en total: mensaje de bienvenida con invitación a crear la primera.
- **Tarjeta de tarea**: título, insignia de ámbito, indicador de fijada. Acciones: completar,
  fijar/desfijar, editar y mover a la papelera. Las fijadas van primero (FR-008a).
- Estados: cargando (esqueleto de los 4 cuadrantes) y error de carga con "Reintentar".

### S4 · Formulario de tarea (modal; crear y editar — US2, US3)
- Campos: título (contador x/200), descripción (contador x/2000), dos interruptores
  independientes "Urgente" e "Importante", y ámbito Laboral/Personal **sin preselección**.
- Vista previa en vivo del cuadrante resultante ("Irá a: Planificar").
- Errores en línea: título o descripción vacíos (solo espacios cuenta como vacío), límite
  superado, ámbito sin elegir.
- Al guardar, la tarea aparece o se mueve a su cuadrante sin recargar la página (US3-3).

### S5 · Historial (US5)
- Lista de tareas completadas, las más recientes primero: título, cuadrante que tuvo, ámbito y
  fecha de finalización.
- Acciones por tarea: "Reabrir" y "Mover a la papelera". Sin acción de editar (FR-011).
- Carga incremental ("Cargar más"). Estado vacío: "Aún no has completado ninguna tarea".

### S6 · Papelera (FR-014a)
- Lista de tareas en la papelera: título, si estaba activa o completada, y "se eliminará en N días".
- Acciones: "Restaurar" y "Eliminar definitivamente". Esta última pide confirmación, porque es
  irreversible.
- Aviso fijo: "Las tareas se eliminan automáticamente a los 30 días".
- Carga incremental. Estado vacío: "La papelera está vacía".

## Mensajes transversales
- Aviso breve (*toast*) tras completar, reabrir, mover a la papelera o restaurar. Al mover a la
  papelera, el aviso ofrece "Deshacer", que llama a *restaurar*.
- Sesión caducada: se redirige a `/login` con el mensaje "Tu sesión ha caducado".
- Un `409` (conflicto entre pestañas) o un `404` en una operación sobre una tarea muestra "La tarea
  cambió en otra ventana" y refresca los datos.
- Al alcanzar el límite de 500 tareas activas (FR-016) se muestra un aviso con el mensaje del
  servidor, que indica el límite; el formulario de creación sigue abierto con lo escrito.
- Si el servidor no puede verificar la sesión (`503`) se muestra su mensaje; cualquier otro fallo
  de una acción muestra "No se pudo completar la acción. Inténtalo de nuevo."
