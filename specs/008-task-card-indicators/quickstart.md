# Quickstart: validar los indicadores compactos de la tarjeta

**Feature**: [spec.md](./spec.md) | **Contrato**: [contracts/task-card-ui.md](./contracts/task-card-ui.md)

## Requisitos

- **Entorno local** como en la feature 007: emuladores de Firebase (Auth y Firestore), backend y
  frontend arrancados (ver `README.md`, sección de desarrollo local).
- **En el sandbox del agente**, los emuladores necesitan `XDG_CONFIG_HOME="$TMPDIR/xdg-config"`.

## Tests automáticos

```bash
npm --prefix frontend run test -- tests/unit/features/board/TaskCard.test.tsx
npm --prefix frontend run lint
npm --prefix frontend run format
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/a11y.spec.ts tests/e2e/start-of-day.spec.ts tests/e2e/schedules.spec.ts
```

Todos en verde. El test nuevo de no solapamiento está en `a11y.spec.ts` (research R8).

## Escenarios manuales (local)

Prepara una tarea **fijada**, **programada** con una fecha anterior a hoy (pendiente) y **de la
misión**, con un título largo (≥ 80 caracteres), y otra tarea normal.

1. **Escritorio, matriz 2×2, densidad normal**, a 768 px (el más estrecho) y a ≥ 1280 px. La tarjeta muestra 📌, calendario y ★
   antes del título. Las acciones no pisan el título y bajan de línea si no caben. «Pendiente
   desde el …» está en el pie y no toca «Completar». → US1-1, US1-2, US1-4, FR-002.
2. **Mismo tablero en densidad compacta** (Perfil → Densidad). Nada se solapa. → US1-3.
3. **Móvil, 320 px** (herramientas del navegador). Nada se solapa y no hay desplazamiento
   horizontal. → US1-3, SC-001.
4. **Tarea normal**: sin iconos ni huecos delante del título. → US1-5.
5. **Pasar el puntero** por el calendario y por la estrella del título: aparecen «Programada» y
   «Misión del día». En la emulación táctil, al tocar se abre y al tocar fuera se cierra. →
   US2-1, FR-004.
6. **Lector de pantalla** (VoiceOver: Cmd+F5) recorriendo la tarjeta: lee «Programada», «Misión
   del día», el título y «Pendiente desde el …». → US2-2, SC-004.
7. **Botón de estrella**:
   - pulsar ☆ en la tarea normal: pasa a ★ y la tarea gana el indicador de misión;
   - volver a pulsar: vuelve a ☆;
   - con 5 tareas en la misión, la ☆ de otra está deshabilitada y el lector anuncia «La misión
     ya tiene 5 tareas.».
   → US3-1 a US3-4.
8. **Tema oscuro**: repetir el 1 y comprobar que los iconos se ven bien. → US2-3.
9. **SC-003**: el propietario identifica sin ayuda qué tarjetas son programadas y cuáles de la
   misión en menos de 5 segundos al ver el diseño por primera vez (se anota en la PR de la fase).

## Resultado esperado

- Todos los escenarios anteriores se cumplen y los tests están en verde.
- El aspecto coincide con S3 v4, aprobada en Stitch.
