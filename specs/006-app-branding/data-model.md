# Modelo de datos — Feature 006: logo y nuevo nombre visible

**Esta feature no añade ni cambia ningún dato guardado.** No hay colecciones de Firestore, campos de perfil, endpoints ni cambios de permisos.
Lo que sigue son los valores fijos del código que la spec llama «entidades».

| Entidad de la spec | Dónde vive | Valor |
|---|---|---|
| Nombre visible de la aplicación | `frontend/src/lib/brand.ts` (`APP_NAME`) y `frontend/index.html` (`<title>`) | `InsertTasks` (con «I» y «T» mayúsculas y «s» final) |
| Mensaje de propósito | `frontend/src/lib/brand.ts` (`APP_TAGLINE`) | `Inserta tus tareas y prioriza lo que importa` |
| Logo | `frontend/src/assets/brand/logo.<ext>` (recurso con hash) y, como icono de la pestaña, `frontend/public/favicon.<ext>` | Imagen que entrega el propietario, sin rediseñar |

## Reglas

- El nombre solo se escribe en `brand.ts` y en el título de `index.html`; un test comprueba que coinciden. Ningún otro fichero de interfaz lo
  repite como literal.
- No se guarda nada por cuenta de usuario: ni el logo ni el nombre dependen de quién entra ni de su perfil.
- Los nombres técnicos (`mytasks-web`, `mytasks-api`, proyectos `pdlco-mytasks*`, repositorio, colecciones) **no cambian** (FR-010).
