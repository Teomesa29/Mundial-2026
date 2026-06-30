from pydantic import BaseModel, ConfigDict, EmailStr, Field
from datetime import datetime
from typing import Optional, Any, List
from app.models.enums import (
    UserRole, ConfederationType, MatchStage, MatchStatus,
    BetType
)

# User schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    role: UserRole
    total_points: int
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Team schemas
class TeamBase(BaseModel):
    name: str
    country_code: str
    flag_emoji: Optional[str] = None
    confederation: ConfederationType
    group_id: Optional[int] = None

class TeamResponse(TeamBase):
    id: int
    fifa_ranking: Optional[int] = None
    is_eliminated: bool
    logo_url: Optional[str] = None
    puntos_fase_grupos: int
    diferencia_goles: int
    goles_favor: int = 0
    goles_contra: int = 0
    partidos_jugados: int = 0
    victorias: int = 0
    empates: int = 0
    derrotas: int = 0
    
    model_config = ConfigDict(from_attributes=True)

# Stadium schemas
class StadiumBase(BaseModel):
    name: str
    city: str
    country: str
    capacity: Optional[int] = None

class StadiumResponse(StadiumBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)

# Match schemas
class MatchBase(BaseModel):
    home_team_id: int
    away_team_id: int
    stadium_id: int
    match_date: datetime
    stage: MatchStage
    group_id: Optional[int] = None
    match_number: int

class MatchResponse(MatchBase):
    id: int
    status: MatchStatus
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    home_score_penalties: Optional[int] = None
    away_score_penalties: Optional[int] = None
    winner_team_id: Optional[int] = None
    home_team: Optional[TeamResponse] = None
    away_team: Optional[TeamResponse] = None
    group_name: Optional[str] = None
    stadium: Optional[StadiumResponse] = None
    
    model_config = ConfigDict(from_attributes=True)

# MatchPrediction schemas
class MatchPredictionBase(BaseModel):
    match_id: int
    predicted_home_score: int = Field(ge=0)
    predicted_away_score: int = Field(ge=0)
    predicted_winner_id: Optional[int] = None

class MatchPredictionCreate(MatchPredictionBase):
    pass

class MatchPredictionResponse(MatchPredictionBase):
    id: int
    user_id: int
    predicted_home_score: Optional[int] = None
    predicted_away_score: Optional[int] = None
    predicted_winner_id: Optional[int] = None
    points_earned: Optional[int] = None
    is_correct_result: Optional[bool] = None
    is_exact_score: Optional[bool] = None
    submitted_at: datetime
    match: Optional[MatchResponse] = None
    
    model_config = ConfigDict(from_attributes=True)

# SpecialBetCategory
class SpecialBetCategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    points_reward: int
    bet_type: BetType
    deadline: datetime
    is_resolved: bool
    
    model_config = ConfigDict(from_attributes=True)

# SpecialBetAnswer
class SpecialBetAnswerBase(BaseModel):
    category_id: int
    answer_team_id: Optional[int] = None
    answer_player_id: Optional[int] = None
    answer_number: Optional[int] = None
    answer_boolean: Optional[bool] = None
    answer_text: Optional[str] = None

class SpecialBetAnswerCreate(SpecialBetAnswerBase):
    pass

class SpecialBetAnswerResponse(SpecialBetAnswerBase):
    id: int
    user_id: int
    points_earned: Optional[int] = None
    is_correct: Optional[bool] = None
    submitted_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Admin create user schema
class AdminCreateUser(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)
    display_name: Optional[str] = None
    role: UserRole = UserRole.participant

# Auth schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

# Bracket schemas
class UserBracketBase(BaseModel):
    bracket_data: dict

class UserBracketCreate(UserBracketBase):
    pass

class UserBracketResponse(UserBracketBase):
    id: int
    user_id: int
    points_earned: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Config schemas
class PollaConfigBase(BaseModel):
    name: str
    description: Optional[str] = None
    season: int = 2026
    entry_deadline: datetime
    prediction_lock_minutes_before_match: int = 60
    points_exact_score: int = 3
    points_correct_result: int = 1
    prize_description: Optional[str] = None
    banner_url: Optional[str] = None
    is_registration_open: bool = True
    max_participants: Optional[int] = None
    
    # Bracket config
    is_bracket_open: bool = False
    points_bracket_r16: Optional[int] = 2
    points_bracket_qf: Optional[int] = 3
    points_bracket_sf: Optional[int] = 5
    points_bracket_final: Optional[int] = 10
    
    # Special bets points
    points_special_champion: Optional[int] = 30
    points_special_subchampion: Optional[int] = 20
    points_special_third_place: Optional[int] = 10
    points_special_scorer: Optional[int] = 20
    points_special_best_player: Optional[int] = 20

class PollaConfigCreate(PollaConfigBase):
    pass

class PollaConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    season: Optional[int] = None
    entry_deadline: Optional[datetime] = None
    prediction_lock_minutes_before_match: Optional[int] = None
    points_exact_score: Optional[int] = None
    points_correct_result: Optional[int] = None
    prize_description: Optional[str] = None
    banner_url: Optional[str] = None
    is_registration_open: Optional[bool] = None
    max_participants: Optional[int] = None
    
    is_bracket_open: Optional[bool] = None
    points_bracket_r16: Optional[int] = None
    points_bracket_qf: Optional[int] = None
    points_bracket_sf: Optional[int] = None
    points_bracket_final: Optional[int] = None
    
    points_special_champion: Optional[int] = None
    points_special_subchampion: Optional[int] = None
    points_special_third_place: Optional[int] = None
    points_special_scorer: Optional[int] = None
    points_special_best_player: Optional[int] = None

class PollaConfigResponse(PollaConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Forecast schemas
class TeamForecast(BaseModel):
    team_id: int
    team_name: str
    country_code: str
    logo_url: Optional[str] = None
    points: int = 0
    played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goals_for: int = 0
    goals_against: int = 0
    goal_difference: int = 0

class GroupForecast(BaseModel):
    group_id: int
    group_name: str
    standings: List[TeamForecast]
    real_standings: Optional[List[TeamForecast]] = None
