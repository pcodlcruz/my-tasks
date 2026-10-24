# Prompts de Stitch · feature 004 (perfil)

Prompts listos para pegar en la interfaz de Stitch o para el MCP (`generate_screen_from_text`).
Proyecto `projects/13869439670490335529`. Sistema claro: `assets/ec957f11ef474eb58336b8af664aaa2e`;
sistema oscuro: `assets/16783421015770598561`. Contenido de referencia:
[`contracts/ui-screens.md`](../../../specs/004-user-profile-settings/contracts/ui-screens.md).

> **Estado (2026-10-23)**: el MCP dio *timeout* en dos intentos de S7 (con el modelo por defecto y
> con `GEMINI_3_5_FLASH_LITE`) y `list_screens` no mostró ninguna pantalla nueva tras más de 20
> minutos. Ver `tasks.md` T004.

## S7 · Perfil · escritorio · tema claro

```text
S7 Perfil - MyTasks (Escritorio, tema claro). Pantalla nueva "Perfil" en español, con la misma
cabecera que S3 Tablero: marca "MyTasks", navegación Tablero · Historial · Papelera, y a la
derecha un único enlace con avatar redondo de 32 px con iniciales "AC" y el nombre "Ana Cruz"
(activo/subrayado), más el botón de texto "Cerrar sesión".

Título "Perfil". Dos columnas.
Izquierda, tarjeta "Identidad": avatar de 96 px con iniciales "AC"; botones "Elegir avatar" y
"Quitar avatar"; campo "Nombre para mostrar" = "Ana Cruz" con contador "8/50" y ayuda "Si lo
dejas en blanco se usará el de tu cuenta de Google: Ana Cruz López"; botones "Guardar"
(principal) y "Usar el de Google"; correo "ana@example.com" de solo lectura.
Derecha, tres tarjetas:
1) "Apariencia": "Tema" con control segmentado "Claro" / "Oscuro" / "Sistema" (seleccionado
   "Sistema"); "Densidad" con "Cómoda" (seleccionada) / "Compacta" y miniatura de dos tarjetas.
   Aviso verde "Guardado" con check.
2) "Tablero e historial": "Tablero por defecto" Todas (seleccionada) / Laboral / Personal;
   "Orden de las tareas" Más antiguas primero (seleccionada) / Más recientes primero, con la
   ayuda "Las tareas fijadas siempre aparecen arriba"; "Historial" Últimos 30 días / Últimos 90
   días / Todo (seleccionada).
3) Botón secundario "Restablecer valores por defecto" y la ayuda "No cambia tu nombre ni tu
   avatar".
La opción seleccionada se distingue por borde, fondo e icono de check, no solo por color. Foco
visible de 2 px, contraste AA.
```

## Versiones derivadas

- **Móvil**: el mismo prompt con `deviceType: MOBILE`, una columna y solo el avatar en la cabecera
  (sin el nombre).
- **Oscuro**: aplicar el sistema `assets/16783421015770598561` a la pantalla generada
  (`apply_design_system`) o regenerarla con ese sistema.
- **S3 `-v2`, S5 `-v2`, S4 `-v2`, S6 `-v2`**: `edit_screens` sobre la aprobada (ids en
  `README.md`) con el prompt «Cambia solo la cabecera: a la derecha, un único enlace con avatar
  redondo de 32 px con iniciales "AC" y el nombre "Ana Cruz", más "Cerrar sesión". No cambies
  nada más». Para S5, añadir la franja «Mostrando solo los últimos 30 días · Ver todo» bajo el
  título.
- **S3 compacta**: `edit_screens` sobre S3 con «Reduce el relleno y la separación vertical de las
  tarjetas de tarea (zona de pulsación mínima de 32 px de alto) para que quepa al menos un 25 %
  más de tareas; no cambies el resto».
