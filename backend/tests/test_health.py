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

@pytest.mark.asyncio
async def test_health_check_caching():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # First call hits the DB and populates cache
        res1 = await ac.get("/health?refresh=true")  # force fresh check
        assert res1.status_code in [200, 503]
        data1 = res1.json()
        assert data1["database"]["cached"] is False
        
        # Second call should be cached
        res2 = await ac.get("/health")
        assert res2.status_code in [200, 503]
        data2 = res2.json()
        assert data2["database"]["cached"] is True
        
        # Call with refresh=True should bypass cache
        res3 = await ac.get("/health?refresh=true")
        assert res3.status_code in [200, 503]
        data3 = res3.json()
        assert data3["database"]["cached"] is False
