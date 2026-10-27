# Validación en producción — Feature 005 (T053)

**Fecha**: 2026-10-27
**Validado por**: el propietario (inicio de sesión, `apply`, `dig` y `curl`) y el agente (lecturas con el MCP de Google Cloud y `curl` a URL públicas).
**Alcance**: puesta en servicio de `inserttask.es`, `www.inserttask.es` y `staging.inserttask.es`. Los resultados son los comunicados por el
propietario o medidos por el agente en esta sesión; lo que no se midió consta como pendiente al final, no se da por bueno.

## Cambio de diseño durante la puesta en servicio: el DNS queda en el registrador

El 2026-10-27 el propietario comprobó que el registrador sí admite todos los registros, también los de un subdominio, y decidió mantener
el DNS allí en lugar de Cloud DNS (enmienda en `spec.md`, que sustituye FR-021 a FR-024). Consecuencias para este registro:

- **T048 (cambiar los servidores de nombres) queda sustituida**: los servidores de nombres del dominio siguen siendo los del registrador
  (`ns1/ns2.dondominio.com`, comprobado contra `a.nic.es` a las 09:21 CET). El propietario había solicitado antes el cambio a Google
  Cloud (su panel lo daba por propagado, pero el registro `.es` nunca llegó a publicarlo) y confirmó que los servidores eran los del
  registrador antes de aprobar el borrado de las zonas.
- Las zonas de Cloud DNS se retiraron del código (#81) y se borraron por el pipeline. **Producción**: la lista de zonas del proyecto
  `pdlco-mytasks` está vacía (MCP, solo lectura). Los permisos `mytasksDnsAdmin` y las lecturas de DNS de `mytasksPlanReader` se retiraron (#87);
  en producción `mytasksDnsAdmin` figura como eliminado, sin bindings, y `mytasksPlanReader` sin permisos `dns.*`.
- **El ensayo de staging no usó la delegación de la zona de producción** (E1 y E2 de `quickstart.md`): los registros de `staging` se dieron
  de alta directamente en el registrador.
- **SC-010 (coste de Cloud DNS) ya no aplica**: no hay zonas.

## Camino hasta producción

| Paso | Resultado |
|---|---|
| Release 1.3.0 (#80) fusionada por el propietario | 2026-10-27 06:15 UTC. `apply` de producción y `deploy-production` completados (T045, T046) |
| Release 1.3.1 (#83): retirada de Cloud DNS (#81) y retro-merge (#82) | `apply-production` rechazado dos veces por el guardia de digest (exit 3, sin aplicar nada) |
| Causa | `check_time` de `required_dns_updates`, que cambia en cada plan; corregido en `infra-plan.sh` con test (#84) |
| Release 1.3.2 (#85) | `apply-production` completado; retro-merge #86 fusionado (T054) |

## Registros DNS en el registrador

Comprobados con `dig` por el propietario:

| Nombre | Tipo | Resultado |
|---|---|---|
| `inserttask.es` | `A` | `199.36.158.100` |
| `inserttask.es` | `AAAA` | vacío |
| `inserttask.es` | `TXT` | `"hosting-site=pdlco-mytasks"` |
| `www.inserttask.es` | `A` | `199.36.158.100` |
| `staging.inserttask.es` | `A` | `199.36.158.100` |
| `staging.inserttask.es` | `AAAA` | vacío |
| `staging.inserttask.es` | `TXT` | `"hosting-site=pdlco-mytasks-stg"` |

## Escenarios

| Escenario | Resultado |
|---|---|
| 10 — Hosting sirve la aplicación de producción (T047) | ✅ `https://pdlco-mytasks.web.app/` devuelve el `index.html` de la aplicación. `https://inserttask.es/config.js` apunta a la API y al proyecto de producción (`pdlco-mytasks`, `APP_VERSION` `ec7760b0…`). `GET /health` de la API de producción y la de staging devuelven la misma versión, `a37290cf6b41…`. `CORS_ORIGINS` de `mytasks-api` en producción (MCP, solo lectura): `run.app`, `https://pdlco-mytasks.web.app` y `https://inserttask.es` |
| 13 — Dominio activo con certificado (T049) | ✅ Los tres dominios sirven por HTTPS sin error de certificado. El propietario vio `inserttask.es` como conectado en Firebase; no se leyó `ownership_state` ni `cert.state` en la consola |
| 14 y 15 — Respuestas y redirecciones (T050, parcial) | ✅ `https://inserttask.es/` → `HTTP/2 200` con CSP de producción (`connect-src` a la API de producción, `frame-src` a `pdlco-mytasks.firebaseapp.com`). `https://www.inserttask.es/` → `301` a `https://inserttask.es/`. `http://inserttask.es/` → `301` (la cabecera `location` no se comprobó). Navegadores y rendimiento: ver pendiente |
| E3–E5 — Ensayo de `staging.inserttask.es` (parcial) | ✅ `https://staging.inserttask.es/` → `HTTP/2 200`, CSP de staging (API `mytasks-api-838389521553`, `pdlco-mytasks-stg.firebaseapp.com`) y `/config.js` de `pdlco-mytasks-stg` |
| 16 y 17 — Inicio de sesión (T051, T058, parcial) | ✅ El propietario confirmó que el inicio de sesión con Google funciona en `inserttask.es` y en `staging.inserttask.es`. No se anotó qué cuentas (invitada o no) ni qué pantallas recorrió |

## Duda abierta de la revisión de seguridad

Si autorizar `inserttask.es` en Identity Platform autoriza también sus subdominios: **sin resolver**. El inicio de sesión funciona en los dos, pero cada
entorno autoriza su propio dominio por Terraform (`staging.inserttask.es` en staging), así que la prueba no distingue el caso.

## Cierre de la feature (2026-10-27)

El propietario decidió dar por anotados los casos de abajo y cerrar la feature. **No se midieron ni se comunicaron**: se aceptan sin
medir, no como superados. Quedan como seguimiento, sin plazo, y si se mide alguno se añade aquí en una PR corta.

## Aceptado sin medir (no se midió o no se comunicó)

- Navegadores (Chrome, Safari, Firefox, Edge) y consola del navegador sin errores de CSP ni CORS en los dos dominios (T050, T051, T058).
- Rendimiento (SC-005): mediana de tres cargas en frío de `https://inserttask.es/` frente a la URL `run.app`. Sin medir.
- Cuentas usadas en el inicio de sesión (invitada y no invitada) y pantallas recorridas (T051, T058).
- Orígenes de `CORS_ORIGINS` de la API de **staging** (T059): el agente no puede leer ese proyecto con el MCP; lo confirma el propietario.
- Tiempo de trabajo efectivo y ayuda adicional (SC-008, T056, T060).
- Fecha de caducidad del certificado y comprobación de que se renueva solo y sin concepto en la factura (T052, escenario 19), pasadas unas semanas.
- Comprobar que `location` de `http://inserttask.es/` es `https://inserttask.es/` (`curl -sI http://inserttask.es/ | grep -i '^location'`).
- Backlog de seguridad: LOW-001 (contraste de CORS y dominios, cubierto en parte por `CORS_ORIGINS` de producción), LOW-002 (DNSSEC; ahora depende del registrador) y LOW-003 (`CAA`).
