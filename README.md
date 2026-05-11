# 🏆 Mundial 2026 - Plataforma de Pronósticos

¡Bienvenido a la plataforma definitiva para vivir el Mundial 2026! Esta aplicación permite a los usuarios realizar pronósticos de los partidos, seguir los resultados en tiempo real y competir en un ranking global basado en la precisión de sus predicciones.

## 🚀 Características Principales

### 🔮 Sistema de Pronósticos (Polla)
- **Predicciones Intuitivas**: Interfaz moderna para ingresar resultados de todos los partidos del torneo.
- **Barra de Progreso**: Visualización dinámica del porcentaje de partidos pronosticados con estética premium.
- **Guardado Automático**: Las predicciones se guardan en tiempo real para evitar pérdida de datos.

### 📊 Tablas y Estadísticas
- **Tabla de Predicciones**: Simulación automática de cómo quedaría la tabla de posiciones según tus propios pronósticos.
- **Tabla Real (Oficial)**: Visualización de la tabla de posiciones oficial sincronizada con resultados reales.
- **Transparencia Total**: Desglose detallado de Puntos, Partidos Jugados (PJ), Goles a Favor (GF) y Goles en Contra (GC).

### 📈 Competencia y Puntos
- **Leaderboard**: Ranking global de usuarios actualizado en tiempo real.
- **Sistema de Puntuación**:
  - **Resultado Exacto**: Máxima puntuación por acertar el marcador final.
  - **Tendencia/Ganador**: Puntos por acertar quién gana o si hay empate, aunque el marcador no sea exacto.

### 🛠️ Panel Administrativo
- **Sincronización API**: Integración con servicios externos para obtener resultados oficiales.
- **Gestión Manual**: Capacidad para que el administrador actualice resultados manualmente en caso de ser necesario.

## 🛠️ Stack Tecnológico

- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+)
- **Base de Datos**: [PostgreSQL](https://www.postgresql.org/) (Hospedado en [Neon DB](https://neon.tech/))
- **Frontend**: [React](https://reactjs.org/) con [Vite](https://vitejs.dev/)
- **Estilos**: CSS Vanilla (Custom Design System)
- **ORM**: SQLAlchemy + Alembic para migraciones.

## ⚙️ Configuración e Instalación

### Requisitos Previos
- Python 3.11+
- Node.js 18+
- Base de datos PostgreSQL (Recomendado: Neon.tech)

### Backend
1. Navega a la carpeta backend: `cd backend`
2. Crea un entorno virtual: `python -m venv venv`
3. Activa el entorno: 
   - Windows: `.\venv\Scripts\activate`
   - Linux/Mac: `source venv/bin/activate`
4. Instala las dependencias: `pip install -r requirements.txt`
5. Configura el archivo `.env` basándote en `.env.example`.
6. Ejecuta el servidor: `uvicorn app.main:app --reload`

### Frontend
1. Navega a la carpeta frontend: `cd frontend`
2. Instala las dependencias: `npm install`
3. Inicia el servidor de desarrollo: `npm run dev`

## 📄 Licencia
Este proyecto es para fines recreativos y educativos. Todos los derechos reservados.

---
Desarrollado con ❤️ para los fans del fútbol.
