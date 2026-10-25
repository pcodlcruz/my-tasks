# Contrato de la entrada web (Hosting y dominio propio)

**Feature**: [../spec.md](../spec.md) · Es el comportamiento observable desde fuera que la
implementación debe cumplir y que la validación comprueba.

## 1. Encaminamiento

| Petición | Respuesta esperada |
|---|---|
| `GET https://inserttask.com/<cualquier ruta>` | La misma respuesta que daría `mytasks-web` de producción para esa ruta (SPA, activos, `/config.js`), por una conexión con certificado válido |
| `GET https://www.inserttask.com/<ruta>?<query>` | `301` a `https://inserttask.com/<ruta>?<query>` |
| `GET http://inserttask.com/<ruta>` y `http://www…` | Redirección a `https://` y, en el caso de `www`, al canónico. Se asume que Hosting redirige HTTP a HTTPS por sí solo (no figura en la documentación consultada): **a verificar en staging** (escenario 2) y, si no fuera así, declarar la redirección en la configuración de Hosting |
| `GET https://<proyecto>.web.app/<ruta>` | Igual que el canónico (sirve la misma versión). En staging es el único camino por Hosting |
| `GET https://mytasks-web-<nº>.europe-southwest1.run.app/<ruta>` | Sigue respondiendo con la aplicación, sin redirección (FR-011) |

Una sola regla de reescritura en Hosting: `**` → servicio `mytasks-web`, región `europe-southwest1`.
No hay reglas para `/api/**`: la API se llama en su dirección `run.app` (research R3).

## 2. Cabeceras que deben llegar al navegador

El contenedor ya las emite; Hosting no debe perder ni alterar ninguna en las respuestas de la web:

| Cabecera | Comprobación |
|---|---|
| `Content-Security-Policy` | Igual que la actual; `img-src 'self' data: blob:`; `connect-src` con la API de producción |
| `Strict-Transport-Security` | Presente |
| `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` | Presentes |
| `Cache-Control` de `/config.js` y de las rutas de la SPA | `no-store`; no se sirven desde la caché de la CDN |
| `Cache-Control` de `/assets/*` | `public, max-age=31536000, immutable` |

Si una cabecera se perdiera a través de Hosting, se declara en la configuración de Hosting (misma
política, sin relajar nada) y se anota en la revisión de seguridad.

## 3. Registros DNS que debe poner el propietario

Los valores concretos los entrega Hosting tras el `apply` (se leen de las salidas de Terraform o de la
consola de Firebase). Forma de lo que se pide:

| Nombre | Tipo | Valor | Cuándo |
|---|---|---|---|
| `inserttask.com` | `TXT` | `hosting-site=pdlco-mytasks` (confirmar con las salidas) | Siempre y **permanente** |
| `inserttask.com` | `A`, `AAAA` | IP indicadas por Hosting | Para dirigir el tráfico |
| `www.inserttask.com` | `A`, `AAAA` | IP indicadas por Hosting | Para dirigir el tráfico |
| `inserttask.com` | `CAA` | `0 issue "pki.goog"` y `0 issue "letsencrypt.org"` | Solo si ya existen `CAA` en el dominio |

Antes de añadirlos: retirar los `A`, `AAAA` y `CNAME` previos del proveedor (registros de «aparcado»).
Dejar otros distintos a los de Hosting impide emitir el certificado.

## 4. Inicio de sesión desde el dominio propio

- El *popup* de Google se abre contra el dominio de autenticación del proyecto
  (`pdlco-mytasks.firebaseapp.com`); `FIREBASE_AUTH_DOMAIN` no cambia.
- `inserttask.com` está en los dominios autorizados de Identity Platform y en los *referrers* de la clave
  de API web.
- Las reglas de invitación son las de la feature 003, sin cambios.

## 5. Garantías de no regresión

- No hay cambios en la aplicación web, en la API ni en el contrato OpenAPI.
- El pipeline sigue desplegando solo por `deploy-staging` / `deploy-production`; ninguna operación de
  Hosting se hace a mano.
