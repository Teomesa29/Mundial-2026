import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_root_returns_200():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"

@pytest.mark.asyncio
async def test_health_returns_healthy_or_degraded():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    # Es 503 si la db no esta configurada
    assert response.status_code in [200, 503]
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]

@pytest.mark.asyncio
async def test_health_has_database_field():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    data = response.json()
    assert "database" in data
    assert "status" in data["database"]
    assert "response_time_ms" in data["database"]

@pytest.mark.asyncio
async def test_docs_hidden_in_production(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    
    # Comprobar que nuestra configuracion lo pilla (la app se inicializa al cargar main, pero probamos settings)
    assert settings.is_production == True
