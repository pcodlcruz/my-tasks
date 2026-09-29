from mytasks_api.factory import create_app

# uvicorn entry point (`mytasks_api.main:app`). Fails on import if the configuration
# is invalid (e.g. emulator variables outside APP_ENV=local).
app = create_app()
