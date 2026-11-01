# Contrato de interfaz: pantallas a diseñar en Stitch (feature 007)

Proyecto Stitch «MyTasks» y su *design system* actual (claro y oscuro, feature 004). Cada pantalla
se diseña en **claro y oscuro** y en **escritorio y móvil** (FR-035). Las pantallas aprobadas que
cambian se generan como **versión nueva**, sin modificar la aprobada (FR-036). Al aprobarse,
`docs/design/screens/README.md` registra la versión vigente (identificador y fecha), y el HTML y la
captura se versionan en `docs/design/screens/<id>/`.

Si Stitch devuelve un lienzo `DESKTOP` para una variante móvil oscura, se acepta como **solo
color**, con la maquetación de la móvil clara, como en la feature 004.

## Estética arcade común

- La marca «InsertTasks» y su logo de recreativa (feature 006) **no** se rediseñan.
- Tipografía pixel («Press Start 2P») **solo** en cifras y rótulos cortos: marcador, «PULSA START»,
  «¡FASE SUPERADA!», «RÉCORD», «NIVEL 3». El resto, con la tipografía actual.
- La barra de progreso es una barra de energía por segmentos: un segmento por tarea de la meta.
  Al rebasar la meta, los segmentos extra se ven en otro tono.
- Los textos van en español, con guiños arcade: «PULSA START», «¡FASE SUPERADA!»,
  «¡MISIÓN CUMPLIDA!», «¡SUBES DE NIVEL!», «¡NUEVO RÉCORD!», «PARTIDA NUEVA», «Sala de trofeos».
- Contraste AA en ambos temas (FR-020). Nada se comunica solo por color: cada estado lleva un
  icono o un texto.
- **Modo arcade desactivado**: se ocultan puntuación, nivel, logros y celebraciones, pero se ven la
  meta, el progreso y la racha. Cada pantalla afectada lo muestra en una variante, o al menos en
  una nota de la versión de escritorio.

## Pantallas

| Id | Pantalla | Tipo | Contenido mínimo |
|---|---|---|---|
| **S3 v3** | Tablero | versión nueva de S3 v2 (y de la compacta) | **Marcador del día** encima de los cuadrantes: «HOY 2/3», barra de energía, racha con «en juego», y puntuación y nivel con el modo arcade. Botón para reabrir la pantalla de inicio de jornada. Tareas de la **misión** con una marca visible (estrella o icono más texto) y, en cada tarjeta activa, un botón para añadirla o quitarla de la misión, deshabilitado con 5 (FR-004). Tareas **programadas** con una marca y, si están atrasadas, «pendiente desde el lun 3». Aviso de programación que no cupo por el límite de 500. |
| **S3-c** | Celebración | componente sobre S3 v3 | Aviso no modal arriba o abajo (no tapa los cuadrantes en móvil), que se cierra solo: «¡FASE SUPERADA! +500», «¡SUBES DE NIVEL! Nivel 3 · Jugador», «Logro: Primera moneda», «¡NUEVO RÉCORD!». Versión estática para movimiento reducido. |
| **S8** | Inicio de jornada («PULSA START») | nueva, diálogo modal | Resultado de ayer (o del último día activo) con meta cumplida o no, racha, meta de hoy, tareas activas de «Hacer ahora», programadas de hoy y **selector de misión** (hasta 5, marcando tareas de las listas). Botón «Empezar». Estado sin tareas activas: invita a crear la primera. Primer día: «PARTIDA NUEVA». |
| **S9** | Progreso (`/progreso`) | nueva | Calendario de **12 semanas** con intensidad por día; se distinguen meta cumplida, no activo, futuro y hoy, con leyenda. Detalle del día seleccionado: completadas, meta, cumplida o no, misión cumplida y lista de tareas. Estadísticas: mejor día, racha actual, mejor racha, total de tareas, y nivel y puntuación con el modo arcade. **Sala de trofeos**: 12 logros, los conseguidos con su fecha y los bloqueados con su condición. Estado vacío del primer día. |
| **S10** | Tareas programadas (`/programadas`) | nueva | Lista con título, cuadrante, ámbito, repetición en lenguaje natural («Lunes y miércoles», «Día 31 de cada mes (o el último)»), estado (activa, pausada o terminada) y próxima aparición. Acciones: editar, pausar o reanudar, eliminar (con confirmación que aclara que las tareas generadas se quedan). Estado vacío. Aviso al llegar a 50. |
| **S11** | Formulario de programación | nueva, sobre la base de S4 v2 | Los campos de S4 (título, descripción, urgente, importante, ámbito) más **Repetición**: fecha única (selector de fecha), diaria, ciertos días de la semana (7 casillas) o un día del mes (1–31), con la vista previa «Próxima aparición: …». Errores en línea como en S4. |
| **S7 v2** | Perfil | versión nueva de S7 | Sección nueva **«Progreso y juego»**: meta diaria (1–20), días activos (7 casillas, al menos uno), zona horaria (con «Detectada: …» y «Usar esta»), interruptor de la pantalla de inicio de jornada e interruptor del modo arcade. Nota de que «Restablecer» no cambia esta sección. |
| **Cabecera** | Navegación | en S3 v3 | Pestañas «Tablero · Progreso · Programadas · Historial · Papelera» (y «Accesos» para el administrador). Tienen que **caber a 320 px** con la cuenta de administrador (lección de la feature 006): en móvil, menú o desplazamiento horizontal propio de la barra, nunca desbordamiento de la página. |

## Fuera de diseño en Stitch

- La pantalla «Necesitas una invitación» y la de administración de accesos no cambian.
- Las variantes de error (fallo al cargar el progreso) usan el patrón de aviso ya aprobado: un
  aviso discreto en el marcador, sin pantalla propia (edge case de la spec).

## Estimación

Unas 28 generaciones:
- S3 v3, S8, S9, S10 y S11 en claro y oscuro y en escritorio y móvil.
- S7 v2 en claro y oscuro.
- La celebración y la variante sin modo arcade del tablero.

Hay que prever reintentos por los *timeouts* y el indexado tardío del MCP de Stitch (feature
004).
