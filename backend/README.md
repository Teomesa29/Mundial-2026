# Mundial 2026 API

Backend para la aplicación de Polla Deportiva del Mundial 2026, desarrollado con **FastAPI**, **SQLAlchemy**, y **PostgreSQL** (NeonDB). Listo para desplegar en **Render**.

## 🚀 Requisitos

- Python 3.11+
- PostgreSQL (local o NeonDB)

## 🛠️ Instalación Local

1. Clona el repositorio y crea un entorno virtual:
```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

2. Instala las dependencias:
```bash
pip install -r requirements-dev.txt
```

3. Configura el archivo `.env` basándote en `.env.example`.

4. (Opcional) Inicializa Alembic para migraciones si tu base de datos está vacía:
```bash
alembic init alembic
# Luego configura sqlalchemy.url en alembic.ini
```

## 🏃 Ejecución

Arranca el servidor local de desarrollo usando Uvicorn:
```bash
uvicorn app.main:app --reload
```

- **Documentación Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

## 🧪 Pruebas

Ejecuta los tests usando pytest:
```bash
pytest tests/
```

## 📦 Despliegue en Render

El repositorio cuenta con el archivo `render.yaml` pre-configurado como Blueprint. Solo conéctalo a tu cuenta de Render y asegúrate de añadir las variables de entorno manuales para `DATABASE_URL` y `DATABASE_URL_SYNC`.
