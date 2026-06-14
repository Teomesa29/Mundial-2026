import pytest
from unittest.mock import AsyncMock, MagicMock
from app.models.models import Match, MatchPrediction, PollaConfig
from app.models.enums import MatchStage, MatchStatus
from app.services.sync_service import calculate_predictions_points

@pytest.mark.asyncio
async def test_calculate_predictions_points_group_stage():
    db = AsyncMock()
    
    # Mock Match
    match = MagicMock(spec=Match)
    match.id = 1
    match.status = MatchStatus.finished
    match.stage = MatchStage.group
    match.home_score = 2
    match.away_score = 1
    match.home_team_id = 101
    match.away_team_id = 102
    
    # Mock PollaConfig
    config = MagicMock(spec=PollaConfig)
    config.points_exact_score = 5
    config.points_correct_result = 2
    
    # Mock Predictions
    pred1 = MagicMock(spec=MatchPrediction)
    pred1.predicted_home_score = 2
    pred1.predicted_away_score = 1
    pred1.points_earned = 0
    pred1.user_id = 1
    
    pred2 = MagicMock(spec=MatchPrediction)
    pred2.predicted_home_score = 1
    pred2.predicted_away_score = 0
    pred2.points_earned = 0
    pred2.user_id = 2
    
    mock_execute_match = MagicMock()
    mock_execute_match.scalar_one_or_none.return_value = match
    
    mock_execute_config = MagicMock()
    mock_execute_config.scalar_one_or_none.return_value = config
    
    mock_execute_preds = MagicMock()
    mock_execute_preds.scalars.return_value.all.return_value = [pred1, pred2]
    
    # Query matching function to prevent StopIteration
    def db_execute_mock(query, *args, **kwargs):
        q_str = str(query).lower()
        if "from matches" in q_str:
            return mock_execute_match
        elif "from polla_config" in q_str:
            return mock_execute_config
        elif "from match_predictions" in q_str:
            return mock_execute_preds
        return MagicMock()
        
    db.execute.side_effect = db_execute_mock
    
    await calculate_predictions_points(db, 1)
    
    # Assertions
    # Pred 1 is exact: should get p_exact (5)
    assert pred1.points_earned == 5
    assert pred1.is_exact_score is True
    
    # Pred 2 is correct outcome: should get p_correct (2)
    assert pred2.points_earned == 2
    assert pred2.is_correct_result is True

@pytest.mark.asyncio
async def test_calculate_predictions_points_knockout_penalties():
    db = AsyncMock()
    
    # Mock Match: Ended in a draw (1-1), decided by penalties (home wins 4-3)
    match = MagicMock(spec=Match)
    match.id = 2
    match.status = MatchStatus.finished
    match.stage = MatchStage.round_of_16
    match.home_score = 1
    match.away_score = 1
    match.home_score_penalties = 4
    match.away_score_penalties = 3
    match.home_team_id = 101  # Real shootout winner
    match.away_team_id = 102
    
    # Mock PollaConfig
    config = MagicMock(spec=PollaConfig)
    config.points_exact_score = 5
    config.points_correct_result = 3
    
    # Mock Predictions
    # Pred 1: Exact draw (1-1) AND guessed penalties winner (101) correctly -> 5 + 1 = 6 points
    pred1 = MagicMock(spec=MatchPrediction)
    pred1.predicted_home_score = 1
    pred1.predicted_away_score = 1
    pred1.predicted_winner_id = 101
    pred1.points_earned = 0
    pred1.user_id = 1
    
    # Pred 2: Exact draw (1-1) BUT guessed penalties winner (102) incorrectly -> 5 points
    pred2 = MagicMock(spec=MatchPrediction)
    pred2.predicted_home_score = 1
    pred2.predicted_away_score = 1
    pred2.predicted_winner_id = 102
    pred2.points_earned = 0
    pred2.user_id = 2
    
    # Pred 3: Correct draw outcome but wrong score (2-2) AND guessed penalties winner (101) correctly -> 3 + 1 = 4 points
    pred3 = MagicMock(spec=MatchPrediction)
    pred3.predicted_home_score = 2
    pred3.predicted_away_score = 2
    pred3.predicted_winner_id = 101
    pred3.points_earned = 0
    pred3.user_id = 3
    
    # Pred 4: Correct draw outcome but wrong score (2-2) BUT guessed penalties winner (102) incorrectly -> 3 points
    pred4 = MagicMock(spec=MatchPrediction)
    pred4.predicted_home_score = 2
    pred4.predicted_away_score = 2
    pred4.predicted_winner_id = 102
    pred4.points_earned = 0
    pred4.user_id = 4

    # Pred 5: Predicted winner (2-1 home win) but match was a draw -> 0 points
    pred5 = MagicMock(spec=MatchPrediction)
    pred5.predicted_home_score = 2
    pred5.predicted_away_score = 1
    pred5.predicted_winner_id = 101
    pred5.points_earned = 0
    pred5.user_id = 5
    
    mock_execute_match = MagicMock()
    mock_execute_match.scalar_one_or_none.return_value = match
    
    mock_execute_config = MagicMock()
    mock_execute_config.scalar_one_or_none.return_value = config
    
    mock_execute_preds = MagicMock()
    mock_execute_preds.scalars.return_value.all.return_value = [pred1, pred2, pred3, pred4, pred5]
    
    # Query matching function to prevent StopIteration
    def db_execute_mock(query, *args, **kwargs):
        q_str = str(query).lower()
        if "from matches" in q_str:
            return mock_execute_match
        elif "from polla_config" in q_str:
            return mock_execute_config
        elif "from match_predictions" in q_str:
            return mock_execute_preds
        return MagicMock()
        
    db.execute.side_effect = db_execute_mock
    
    await calculate_predictions_points(db, 2)
    
    # Assertions
    assert pred1.points_earned == 6
    assert pred2.points_earned == 5
    assert pred3.points_earned == 4
    assert pred4.points_earned == 3
    assert pred5.points_earned == 0
