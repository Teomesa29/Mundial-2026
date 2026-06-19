from datetime import datetime, date
from typing import Optional, List, Any
from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime, Date, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .base import Base
from .enums import (
    UserRole, ConfederationType, MatchStage, MatchStatus,
    PlayerPosition, EventType, BetType, PointSourceType
)

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(100))
    avatar_url: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(default=UserRole.participant)
    total_points: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    predictions: Mapped[List["MatchPrediction"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    special_bets: Mapped[List["SpecialBetAnswer"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    bracket: Mapped[Optional["UserBracket"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(1), unique=True, nullable=False)
    is_completed: Mapped[bool] = mapped_column(default=False)

    teams: Mapped[List["Team"]] = relationship(back_populates="group")

class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[Optional[int]] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    flag_emoji: Mapped[Optional[str]] = mapped_column(String(10))
    confederation: Mapped[ConfederationType] = mapped_column(nullable=False)
    fifa_ranking: Mapped[Optional[int]] = mapped_column()
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("groups.id", ondelete="SET NULL"))
    is_eliminated: Mapped[bool] = mapped_column(default=False)
    eliminated_at_stage: Mapped[Optional[MatchStage]] = mapped_column()
    logo_url: Mapped[Optional[str]] = mapped_column(String(255))
    
    goles_favor: Mapped[int] = mapped_column(default=0)
    goles_contra: Mapped[int] = mapped_column(default=0)
    partidos_jugados: Mapped[int] = mapped_column(default=0)
    victorias: Mapped[int] = mapped_column(default=0)
    empates: Mapped[int] = mapped_column(default=0)
    derrotas: Mapped[int] = mapped_column(default=0)
    puntos_fase_grupos: Mapped[int] = mapped_column(default=0)
    diferencia_goles: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    group: Mapped[Optional["Group"]] = relationship(back_populates="teams")
    players: Mapped[List["Player"]] = relationship(back_populates="team")

class Stadium(Base):
    __tablename__ = "stadiums"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    country: Mapped[str] = mapped_column(String(50), nullable=False)
    capacity: Mapped[Optional[int]] = mapped_column()
    timezone: Mapped[Optional[str]] = mapped_column(String(50))
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 8))
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(11, 8))

class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    external_match_id: Mapped[Optional[int]] = mapped_column(unique=True, index=True)
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False)
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False)
    stadium_id: Mapped[int] = mapped_column(ForeignKey("stadiums.id", ondelete="RESTRICT"), nullable=False)
    match_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stage: Mapped[MatchStage] = mapped_column(nullable=False)
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("groups.id", ondelete="RESTRICT"))
    match_number: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[MatchStatus] = mapped_column(default=MatchStatus.scheduled)
    
    home_score: Mapped[Optional[int]] = mapped_column()
    away_score: Mapped[Optional[int]] = mapped_column()
    home_score_extra: Mapped[Optional[int]] = mapped_column()
    away_score_extra: Mapped[Optional[int]] = mapped_column()
    home_score_penalties: Mapped[Optional[int]] = mapped_column()
    away_score_penalties: Mapped[Optional[int]] = mapped_column()
    winner_team_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"))
    
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    home_team: Mapped["Team"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["Team"] = relationship(foreign_keys=[away_team_id])
    group: Mapped[Optional["Group"]] = relationship()
    stadium: Mapped["Stadium"] = relationship()

class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    shirt_number: Mapped[Optional[int]] = mapped_column()
    position: Mapped[PlayerPosition] = mapped_column(nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    nationality: Mapped[Optional[str]] = mapped_column(String(50))
    photo_url: Mapped[Optional[str]] = mapped_column(String(255))
    is_active_in_tournament: Mapped[bool] = mapped_column(default=True)

    team: Mapped["Team"] = relationship(back_populates="players")

class PlayerTournamentStats(Base):
    __tablename__ = "player_tournament_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), unique=True, nullable=False)
    goals: Mapped[int] = mapped_column(default=0)
    assists: Mapped[int] = mapped_column(default=0)
    yellow_cards: Mapped[int] = mapped_column(default=0)
    red_cards: Mapped[int] = mapped_column(default=0)
    minutes_played: Mapped[int] = mapped_column(default=0)
    matches_played: Mapped[int] = mapped_column(default=0)
    saves: Mapped[int] = mapped_column(default=0)
    clean_sheets: Mapped[int] = mapped_column(default=0)

class MatchEvent(Base):
    __tablename__ = "match_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="RESTRICT"), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False)
    event_type: Mapped[EventType] = mapped_column(nullable=False)
    minute: Mapped[int] = mapped_column(nullable=False)
    extra_time_minute: Mapped[Optional[int]] = mapped_column()
    description: Mapped[Optional[str]] = mapped_column(Text)

class MatchPrediction(Base):
    __tablename__ = "match_predictions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="RESTRICT"), nullable=False, index=True)
    predicted_home_score: Mapped[int] = mapped_column(nullable=False)
    predicted_away_score: Mapped[int] = mapped_column(nullable=False)
    predicted_winner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"))
    points_earned: Mapped[Optional[int]] = mapped_column()
    is_correct_result: Mapped[Optional[bool]] = mapped_column()
    is_exact_score: Mapped[Optional[bool]] = mapped_column()
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="predictions")
    match: Mapped["Match"] = relationship()

class SpecialBetCategory(Base):
    __tablename__ = "special_bet_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    points_reward: Mapped[int] = mapped_column(nullable=False)
    bet_type: Mapped[BetType] = mapped_column(nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    correct_answer: Mapped[Optional[Any]] = mapped_column(JSONB)
    is_resolved: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class SpecialBetAnswer(Base):
    __tablename__ = "special_bet_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("special_bet_categories.id", ondelete="RESTRICT"), nullable=False)
    answer_team_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"))
    answer_player_id: Mapped[Optional[int]] = mapped_column(ForeignKey("players.id", ondelete="RESTRICT"))
    answer_number: Mapped[Optional[int]] = mapped_column()
    answer_boolean: Mapped[Optional[bool]] = mapped_column()
    answer_text: Mapped[Optional[str]] = mapped_column(String(255))
    points_earned: Mapped[Optional[int]] = mapped_column()
    is_correct: Mapped[Optional[bool]] = mapped_column()
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="special_bets")

class PointsHistory(Base):
    __tablename__ = "points_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source_type: Mapped[PointSourceType] = mapped_column(nullable=False)
    source_id: Mapped[int] = mapped_column(nullable=False)
    points_delta: Mapped[int] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_admin_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int] = mapped_column(nullable=False)
    old_value: Mapped[Optional[Any]] = mapped_column(JSONB)
    new_value: Mapped[Optional[Any]] = mapped_column(JSONB)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class PollaConfig(Base):
    __tablename__ = "polla_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    season: Mapped[int] = mapped_column(default=2026)
    entry_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    prediction_lock_minutes_before_match: Mapped[int] = mapped_column(default=60)
    points_exact_score: Mapped[int] = mapped_column(default=3)
    points_correct_result: Mapped[int] = mapped_column(default=1)
    prize_description: Mapped[Optional[str]] = mapped_column(Text)
    banner_url: Mapped[Optional[str]] = mapped_column(String(255))
    is_registration_open: Mapped[bool] = mapped_column(default=True)
    max_participants: Mapped[Optional[int]] = mapped_column()
    
    # Bracket config
    is_bracket_open: Mapped[bool] = mapped_column(default=False)
    points_bracket_r16: Mapped[int] = mapped_column(default=2)
    points_bracket_qf: Mapped[int] = mapped_column(default=3)
    points_bracket_sf: Mapped[int] = mapped_column(default=5)
    points_bracket_final: Mapped[int] = mapped_column(default=10)
    # Special bets points
    points_special_champion: Mapped[int] = mapped_column(default=30)
    points_special_subchampion: Mapped[int] = mapped_column(default=20)
    points_special_third_place: Mapped[int] = mapped_column(default=10)
    points_special_scorer: Mapped[int] = mapped_column(default=20)
    points_special_best_player: Mapped[int] = mapped_column(default=20)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class UserBracket(Base):
    __tablename__ = "user_brackets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    bracket_data: Mapped[Any] = mapped_column(JSONB, nullable=False, default=dict)
    points_earned: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="bracket")
