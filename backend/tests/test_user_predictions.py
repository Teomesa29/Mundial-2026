import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock
from app.main import app
from app.core.deps import get_current_user
from app.core.database import get_db
from app.models.models import User, MatchPrediction, Match, Team, Group, Stadium
from app.models.enums import UserRole, MatchStage, MatchStatus, ConfederationType

@pytest.mark.asyncio
async def test_get_user_predictions_success():
    # Mock user and predictions data
    mock_user = MagicMock(spec=User)
    mock_user.id = 1
    mock_user.role = UserRole.participant
    mock_user.is_active = True

    mock_target_user = MagicMock(spec=User)
    mock_target_user.id = 2

    # Mock Match and Prediction
    mock_match = MagicMock(spec=Match)
    mock_match.id = 10
    mock_match.home_score = 1
    mock_match.away_score = 1
    mock_match.status = MatchStatus.finished
    mock_match.stage = MatchStage.group
    mock_match.match_date = "2026-06-20T18:00:00Z"
    
    # Mock nested items
    mock_home_team = MagicMock(spec=Team)
    mock_home_team.id = 1
    mock_home_team.name = "Argentina"
    mock_home_team.country_code = "AR"
    mock_home_team.flag_emoji = "🇦🇷"
    mock_home_team.confederation = ConfederationType.CONMEBOL
    mock_home_team.puntos_fase_grupos = 0
    mock_home_team.diferencia_goles = 0
    mock_home_team.goles_favor = 0
    mock_home_team.goles_contra = 0
    mock_home_team.partidos_jugados = 0
    mock_home_team.victorias = 0
    mock_home_team.empates = 0
    mock_home_team.derrotas = 0
    mock_home_team.is_eliminated = False
    mock_home_team.logo_url = None
    
    mock_away_team = MagicMock(spec=Team)
    mock_away_team.id = 2
    mock_away_team.name = "Brazil"
    mock_away_team.country_code = "BR"
    mock_away_team.flag_emoji = "🇧🇷"
    mock_away_team.confederation = ConfederationType.CONMEBOL
    mock_away_team.puntos_fase_grupos = 0
    mock_away_team.diferencia_goles = 0
    mock_away_team.goles_favor = 0
    mock_away_team.goles_contra = 0
    mock_away_team.partidos_jugados = 0
    mock_away_team.victorias = 0
    mock_away_team.empates = 0
    mock_away_team.derrotas = 0
    mock_away_team.is_eliminated = False
    mock_away_team.logo_url = None
    
    mock_group = MagicMock(spec=Group)
    mock_group.id = 1
    mock_group.name = "A"
    
    mock_stadium = MagicMock(spec=Stadium)
    mock_stadium.id = 1
    mock_stadium.name = "Lusail Stadium"
    mock_stadium.city = "Lusail"
    mock_stadium.country = "Qatar"

    mock_match.home_team = mock_home_team
    mock_match.away_team = mock_away_team
    mock_match.group = mock_group
    mock_match.stadium = mock_stadium

    mock_pred = MagicMock(spec=MatchPrediction)
    mock_pred.id = 100
    mock_pred.user_id = 2
    mock_pred.match_id = 10
    mock_pred.predicted_home_score = 2
    mock_pred.predicted_away_score = 1
    mock_pred.predicted_winner_id = None
    mock_pred.points_earned = 3
    mock_pred.is_correct_result = True
    mock_pred.is_exact_score = False
    mock_pred.submitted_at = "2026-06-18T18:00:00Z"
    mock_pred.match = mock_match

    # Mock DB execute
    db = AsyncMock()
    
    mock_execute_user = MagicMock()
    mock_execute_user.scalar_one_or_none.return_value = 2 # Target user exists
    
    mock_execute_preds = MagicMock()
    mock_execute_preds.scalars.return_value.unique.return_value.all.return_value = [mock_pred]

    def db_execute_mock(query, *args, **kwargs):
        q_str = str(query).lower()
        if "from users" in q_str:
            return mock_execute_user
        elif "from match_predictions" in q_str:
            return mock_execute_preds
        return MagicMock()

    db.execute.side_effect = db_execute_mock

    # Set dependency overrides
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: db

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/predictions/user/2")
            
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == 100
        assert data[0]["user_id"] == 2
        assert data[0]["predicted_home_score"] == 2
        assert data[0]["predicted_away_score"] == 1
        assert data[0]["points_earned"] == 3
        assert data[0]["match"]["home_team"]["name"] == "Argentina"
        assert data[0]["match"]["away_team"]["name"] == "Brazil"
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_get_user_predictions_not_found():
    mock_user = MagicMock(spec=User)
    mock_user.id = 1
    mock_user.role = UserRole.participant
    mock_user.is_active = True

    db = AsyncMock()
    mock_execute_user = MagicMock()
    mock_execute_user.scalar_one_or_none.return_value = None # Target user does not exist
    db.execute.return_value = mock_execute_user

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: db

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/predictions/user/999")
            
        assert response.status_code == 404
        assert response.json()["detail"] == "Usuario no encontrado"
    finally:
        app.dependency_overrides.clear()
