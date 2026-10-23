# Quickstart: validar el perfil de usuario y las preferencias

Guía de validación de extremo a extremo. Contratos en [contracts/profile.yaml](contracts/profile.yaml)
y [contracts/ui-screens.md](contracts/ui-screens.md); modelo en [data-model.md](data-model.md).

## Prerrequisitos

- Emuladores de Firestore y Auth en marcha (`firebase emulators:start`), `APP_ENV=local`.
- `BOOTSTRAP_ADMIN_EMAIL=admin@example.com` en `backend/.env` (como en la feature 003).
- Backend y frontend arrancados como en la quickstart de la feature 001.
- Dos cuentas activas: `admin@example.com` y una invitada (`ana@example.com`), con tareas
  laborales y personales en ambas.
- Imágenes de prueba: una JPEG, una PNG y una WebP válidas (< 2 MB), una de más de 2 MB, un
  archivo de texto renombrado a `.png` y una JPEG con coordenadas EXIF. Los tests las generan; a
  mano, cualquier foto del móvil sirve.

## Escenarios

1. **Tema y recarga sin destello (US1, SC-001, SC-002)**: en `/perfil` elegir «Oscuro». Toda la
   aplicación pasa a oscuro sin recargar. Recargar con la pestaña de red limitada: no aparece el
   tema claro ni un instante. Cerrar sesión, volver a entrar y abrir desde otro navegador con la
   misma cuenta: sigue en oscuro.
2. **Tema «Sistema» (US1.3)**: elegir «Sistema» y cambiar el tema del sistema operativo: la
   aplicación lo sigue en vivo.
3. **Densidad (US1.5, SC-005)**: elegir «Compacta». En el tablero con un cuadrante lleno caben al
   menos un 25 % más de tareas; el texto sigue legible. Volver a «Cómoda».
4. **Tablero por defecto (US2, SC-003)**: elegir «Laboral». Cerrar sesión, entrar: el tablero se
   abre filtrado por «Laboral» y el filtro lo muestra seleccionado. Cambiar el filtro a
   «Personal», navegar y volver a abrir la aplicación: vuelve a «Laboral» (el filtro puntual no
   cambió el perfil).
5. **Orden (US2.4)**: elegir «Más recientes primero». En cada cuadrante, de la más reciente a la
   más antigua, con las fijadas arriba. Volver a «Más antiguas primero».
6. **Periodo del historial (US2.5)**: completar tareas de distintas fechas (o usar datos de
   prueba). Elegir «Últimos 30 días»: el historial muestra «Mostrando solo los últimos 30 días ·
   Ver todo» y únicamente lo completado en ese periodo; «Ver todo» lo muestra completo solo en
   esa visita. Ninguna tarea se ha borrado.
7. **Nombre para mostrar (US3.3, US3.4, US3.5)**: escribir «Ana 🌱» y guardar: la cabecera lo
   muestra. Probar vacío, solo espacios y 51 caracteres: mensaje claro y se conserva el anterior.
   Probar `<img src=x onerror=alert(1)>`: se muestra como texto literal. «Usar el de Google»
   devuelve el nombre de la cuenta.
8. **Avatar predefinido (US3.1, US3.2)**: sin avatar, la cabecera muestra las iniciales sobre un
   color (nunca un hueco). Elegir uno del catálogo: se ve en cabecera y en «Perfil» y persiste
   entre sesiones. «Quitar avatar» devuelve las iniciales.
9. **Subir imagen (US4.1, SC-006)**: «Subir imagen», elegir la JPEG, ajustar el encuadre y
   guardar. Se ve como avatar. Sustituirla por la PNG. Comprobar en el emulador de Firestore que
   `users/{uid}/settings/avatar` tiene una sola imagen de ≤ 200 KB y que el WebP no lleva
   metadatos EXIF.
10. **Imágenes inválidas (US4.2)**: probar el archivo de más de 2 MB, el texto renombrado a
    `.png` y una imagen corrupta: cada una se rechaza con un mensaje claro y el avatar anterior no
    cambia.
11. **Quitar la imagen (US4.4)**: «Quitar avatar»: vuelven las iniciales y el documento `avatar`
    ya no existe. Elegir un avatar del catálogo estando subida una imagen: la imagen se elimina.
12. **Privacidad (US4.5, SC-007)**: con el token de `ana`, `GET /api/v1/me/avatar` solo devuelve
    la imagen de `ana`; sin token responde 401; con una cuenta revocada, 403. No existe ninguna
    ruta con el `uid` de otra persona.
13. **Límite de subidas (FR-025)**: la subida número 11 en una hora responde 429 con
    `Retry-After` y la interfaz pide esperar.
14. **Fallo al guardar (FR-003, FR-026)**: con el backend detenido, cambiar el tema: aviso con
    «Reintentar», el control vuelve al valor guardado y el tablero sigue usable.
15. **Restablecer (FR-005)**: «Restablecer valores por defecto» con confirmación: tema «Sistema»,
    «Cómoda», «Todas», «Más antiguas primero» e historial completo. El nombre y el avatar no
    cambian.
16. **Sin cambios para quien no toca nada (SC-009)**: con una cuenta sin documento `settings`, la
    aplicación se ve y se comporta exactamente como antes de la feature.
17. **Accesibilidad (SC-008)**: la comprobación axe de las pantallas (incluidas `/perfil`,
    `/admin/access` y «Necesitas una invitación») pasa en tema claro y en oscuro.

## Comandos de prueba

```bash
# Backend: unitarios e integración (con los emuladores en marcha)
cd backend && pytest tests/unit tests/integration

# Frontend: unitarios y e2e (los e2e incluyen axe en los dos temas)
cd frontend && npm test && npm run test:e2e
```

Resultado esperado: todo en verde, incluidas las pruebas del procesado de imágenes (formatos
válidos, no imágenes, bomba de descompresión, EXIF eliminado, tope de 2 MB), la parametrizada que
comprueba el 403 y el 401 de cada endpoint nuevo, y los e2e de los escenarios 1–15.

## Diseño (antes de la implementación de interfaz)

Las versiones nuevas de las pantallas de [contracts/ui-screens.md](contracts/ui-screens.md) están
aprobadas por el propietario y exportadas a `docs/design/screens/`, y `README.md` de esa carpeta
anota la pantalla vigente de cada una.

## Validación en staging (tras desplegar por el pipeline)

Repetir los escenarios 1, 4, 7, 9, 12 y 16 con cuentas reales de prueba. No hay variables nuevas
ni cambios de infraestructura: el pipeline no necesita nada más. Comprobar en el navegador que la
CSP permite mostrar el avatar (`img-src` con `blob:`) sin errores en la consola.
