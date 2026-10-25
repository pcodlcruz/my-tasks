# Informe de Auditoría de Seguridad — Feature 004, Fase 3 (apariencia: tema y densidad)

**Fecha**: 2026-10-24 · **Rama**: `feature/004-user-profile-settings-fase-3`

**Tipología detectada**: Aplicación web (React) que consume la API de la Fase 2. Sin cambios de
backend, de datos, de IAM ni de infraestructura.

**Marcos aplicados**: OWASP Top 10, OWASP ASVS (V5 salida y V14 configuración del cliente).

**Nivel de riesgo global**: Bajo (sin hallazgos críticos, altos ni medios).

---

## Resumen ejecutivo

Se auditó el código nuevo de la fase: el script externo `public/theme-init.js`, la caché local
`mytasks.appearance`, la ruta `/perfil`, los hooks de `api/profile.ts`, la página de perfil con sus
estados de error y el cambio de la paleta a variables CSS (que toca casi todos los componentes).

No hay hallazgos críticos, altos ni medios. **No bloquea la fusión.** Hay dos hallazgos bajos para
el backlog y una nota de riesgo aceptado ya recogida en la investigación (R8).

| Control | Resultado | Evidencia |
|---|---|---|
| CSP sin relajar | ✅ | No se toca `40-runtime-config.sh`: `script-src 'self' https://apis.google.com` y `style-src 'self'` siguen igual. El tema se aplica con un script **externo** del mismo origen, no en línea |
| Sin estilos ni scripts en línea | ✅ | `grep` de `style={` en `frontend/src` sin resultados; el tema y la densidad son atributos de `<html>` y clases de la hoja de estilos |
| Sin inserción de HTML | ✅ | `grep` de `dangerouslySetInnerHTML`, `innerHTML`, `eval(` y `new Function` en `src/` y `public/` sin resultados |
| Caché local mínima y tolerante | ✅ | Solo guarda dos cadenas (`theme`, `density`); `readCachedAppearance` y `theme-init.js` validan contra listas cerradas y caen en los valores por defecto ante JSON corrupto, valores ajenos o fallo de `localStorage` (`appearance.test.ts`, `theme-init.test.ts`) |
| `theme-init.js` autocontenido | ✅ | Sin imports, sin red, sin `eval`; un test lo comprueba (`es autocontenido…`). Lee solo `localStorage` y `matchMedia`, y escribe solo dos atributos de `<html>` |
| Ruta protegida | ✅ | `/perfil` está dentro de `ProtectedLayout` → `ProtectedRoute` (sesión y cuenta activa); `ProtectedRoute.test.tsx` cubre sesión, sin sesión y cuenta sin acceso. La autorización real sigue en la API (`get_active_user`) |
| Errores sin filtrar datos | ✅ | Ante cualquier fallo al guardar se muestra un mensaje fijo; `ProfilePage.test.tsx` comprueba que el texto que devuelve el servidor **no** aparece |
| Sin datos personales en la caché ni en registros | ✅ | La caché no contiene nombre, correo ni uid. La interfaz no escribe registros |
| Dependencias | ✅ | Ninguna nueva (`tailwindcss/plugin` forma parte de la dependencia ya existente) |
| Accesibilidad como control de seguridad de uso | ✅ | axe sin violaciones en claro y oscuro en tablero, historial, papelera, perfil, formulario, confirmación, `/admin/access`, «Necesitas una invitación» e inicio de sesión (`a11y.spec.ts`) |

---

## Hallazgos

### [LOW-001] `theme-init.js` cae al `index.html` si falta del contenedor
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A05: Security Misconfiguration (robustez del despliegue) |
| **Componente afectado** | `frontend/nginx/default.conf` (`location /`) |

**Descripción**
El script se sirve desde `location /`, cuya regla `try_files $uri /index.html` devolvería el HTML de
la aplicación con un 200 si `theme-init.js` faltara de la imagen. El navegador no lo ejecutaría
(`X-Content-Type-Options: nosniff` y tipo `text/html`), así que no hay ejecución de código ni
fuga, pero el fallo pasaría inadvertido: volvería el destello del tema contrario sin ningún error
visible en el despliegue. `config.js` ya tiene su propia regla `try_files $uri =404` por esta razón.

**Evidencia**
`default.conf` define reglas explícitas para `config.js`, `index.html`, `/assets/` y `favicon.svg`,
pero no para `theme-init.js`. El script vive en `public/`, así que Vite lo copia a la raíz de la
imagen.

**Remediación requerida**
Añadir una regla `location = /theme-init.js` con `try_files $uri =404`, cabecera de seguridad y
`Cache-Control: no-cache` (revalidar: no tiene hash en el nombre), y ampliar
`frontend/nginx/tests/` para comprobar que la respuesta es JavaScript. No se hizo en esta fase
porque la imagen no se puede construir ni probar desde la sesión del agente y el cambio no es
necesario para que funcione.

**Destinatario**
- Skill/agente: `mytasks-frontend-developer` (configuración del contenedor web)
- Tipo de cambio: De configuración

---

### [LOW-002] La caché de apariencia sobrevive al cierre de sesión
| Campo | Valor |
|---|---|
| **Severidad** | Baja (riesgo aceptado en R8) |
| **Categoría** | OWASP A04: Insecure Design (privacidad en equipos compartidos) |
| **Componente afectado** | `src/lib/appearance.ts`, `public/theme-init.js` |

**Descripción**
`mytasks.appearance` no se borra al cerrar sesión (es lo que permite pintar el login con el último
tema, sin destello). En un ordenador compartido, quien abre la pantalla de inicio de sesión ve el
último tema y densidad usados. Son dos cadenas de una lista cerrada, sin datos personales; el
impacto es solo de aspecto.

**Evidencia**
`SessionCacheReset` vacía la caché de TanStack Query al cambiar de persona, pero no toca
`localStorage`; `useAppearance` solo escribe la caché, nunca la borra.

**Remediación requerida**
Ninguna obligatoria: está documentado en `research.md` R8 y en FR-007/SC-002. Si el propietario
cambia de criterio, bastaría borrar la clave en `SessionCacheReset` al detectar el cierre de sesión
(a costa de que el login vuelva a pintarse con el tema del sistema).

**Destinatario**
- Skill/agente: `mytasks-frontend-developer` (solo si el propietario lo decide)
- Tipo de cambio: De implementación

---

## Categorías sin hallazgos o fuera de alcance

- **Autenticación y autorización, modelo de datos, red, IAM, secretos**: sin cambios en esta fase
  (no hay endpoints ni documentos nuevos; los de la Fase 2 ya se auditaron en
  [security-review-fase-2.md](./security-review-fase-2.md)).
- **LOW-002 de la Fase 2** (el nombre para mostrar se escapa en el cliente): **no aplica todavía**,
  porque esta fase no muestra el nombre en ningún sitio. Sigue siendo requisito de la Fase 5.
- **Nota operativa (no de seguridad)**: los e2e de la feature 003 (`revoke-access`) fallan si se
  repiten muchas veces sobre los mismos emuladores sin limpiarlos, porque las invitaciones
  pendientes que dejan otros e2e llegan al tope de 50. Se resuelve reiniciando los datos del
  emulador; no guarda relación con esta fase.

## Resumen de enrutamiento

| ID | Severidad | Estado | Destinatario | Skill/Agente |
|---|---|---|---|---|
| LOW-001 | Baja | Backlog | Desarrollador frontend | `mytasks-frontend-developer` |
| LOW-002 | Baja | Riesgo aceptado (R8) | Desarrollador frontend | `mytasks-frontend-developer` (si cambia el criterio) |
