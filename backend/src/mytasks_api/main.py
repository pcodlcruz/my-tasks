from mytasks_api.factory import create_app

# Punto de entrada de uvicorn (`mytasks_api.main:app`). Falla al importarse si la
# configuración no es válida (p. ej. variables de emulador fuera de APP_ENV=local).
app = create_app()
