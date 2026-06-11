-- schema.sql
-- PostgreSQL Schema for Polla Mundial 2026

-- ENUMS
CREATE TYPE user_role AS ENUM ('admin', 'participant');
CREATE TYPE confederation_type AS ENUM ('UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC');
CREATE TYPE match_stage AS ENUM ('group', 'round_of_32', 'round_of_16', 'quarterfinal', 'semifinal', 'third_place', 'final');
CREATE TYPE match_status AS ENUM ('scheduled', 'live', 'finished', 'postponed');
CREATE TYPE player_position AS ENUM ('goalkeeper', 'defender', 'midfielder', 'forward');
CREATE TYPE event_type AS ENUM ('goal', 'own_goal', 'yellow_card', 'red_card', 'substitution', 'penalty_scored', 'penalty_missed');
CREATE TYPE bet_type AS ENUM ('team', 'player', 'number', 'boolean', 'text');
CREATE TYPE point_source_type AS ENUM ('match_prediction', 'special_bet', 'manual_adjustment');

-- TABLES

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(255),
    role user_role DEFAULT 'participant' NOT NULL,
    total_points INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_login TIMESTAMPTZ
);

CREATE TABLE groups (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(1) NOT NULL UNIQUE, -- A to L
    is_completed BOOLEAN DEFAULT false NOT NULL
);

CREATE TABLE teams (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    flag_emoji VARCHAR(10),
    confederation confederation_type NOT NULL,
    fifa_ranking INT,
    group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL,
    is_eliminated BOOLEAN DEFAULT false NOT NULL,
    eliminated_at_stage match_stage,
    logo_url VARCHAR(255),
    
    -- Estadísticas del torneo (desnormalizadas para lectura rápida)
    goles_favor INT DEFAULT 0 NOT NULL,
    goles_contra INT DEFAULT 0 NOT NULL,
    partidos_jugados INT DEFAULT 0 NOT NULL,
    victorias INT DEFAULT 0 NOT NULL,
    empates INT DEFAULT 0 NOT NULL,
    derrotas INT DEFAULT 0 NOT NULL,
    puntos_fase_grupos INT DEFAULT 0 NOT NULL,
    diferencia_goles INT DEFAULT 0 NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE stadiums (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(50) NOT NULL,
    capacity INT,
    timezone VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8)
);

CREATE TABLE matches (
    id BIGSERIAL PRIMARY KEY,
    home_team_id BIGINT REFERENCES teams(id) ON DELETE RESTRICT,
    away_team_id BIGINT REFERENCES teams(id) ON DELETE RESTRICT,
    stadium_id BIGINT REFERENCES stadiums(id) ON DELETE RESTRICT,
    match_date TIMESTAMPTZ NOT NULL,
    stage match_stage NOT NULL,
    group_id BIGINT REFERENCES groups(id) ON DELETE RESTRICT,
    match_number INT NOT NULL,
    status match_status DEFAULT 'scheduled' NOT NULL,
    
    home_score INT CHECK (home_score >= 0),
    away_score INT CHECK (away_score >= 0),
    home_score_extra INT CHECK (home_score_extra >= 0),
    away_score_extra INT CHECK (away_score_extra >= 0),
    home_score_penalties INT CHECK (home_score_penalties >= 0),
    away_score_penalties INT CHECK (away_score_penalties >= 0),
    
    winner_team_id BIGINT REFERENCES teams(id) ON DELETE RESTRICT,
    
    -- Estadísticas del partido
    home_possession INT,
    away_possession INT,
    home_shots INT,
    away_shots INT,
    home_shots_on_target INT,
    away_shots_on_target INT,
    home_corners INT,
    away_corners INT,
    home_yellow_cards INT,
    away_yellow_cards INT,
    home_red_cards INT,
    away_red_cards INT,
    
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CHECK (home_team_id != away_team_id)
);

CREATE TABLE players (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    shirt_number INT,
    position player_position NOT NULL,
    date_of_birth DATE,
    nationality VARCHAR(50),
    photo_url VARCHAR(255),
    is_active_in_tournament BOOLEAN DEFAULT true NOT NULL
);

CREATE TABLE player_tournament_stats (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE UNIQUE,
    goals INT DEFAULT 0 NOT NULL,
    assists INT DEFAULT 0 NOT NULL,
    yellow_cards INT DEFAULT 0 NOT NULL,
    red_cards INT DEFAULT 0 NOT NULL,
    minutes_played INT DEFAULT 0 NOT NULL,
    matches_played INT DEFAULT 0 NOT NULL,
    saves INT DEFAULT 0 NOT NULL,
    clean_sheets INT DEFAULT 0 NOT NULL
);

CREATE TABLE match_events (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    event_type event_type NOT NULL,
    minute INT NOT NULL CHECK (minute >= 0 AND minute <= 130),
    extra_time_minute INT CHECK (extra_time_minute >= 0),
    description TEXT
);

CREATE TABLE match_predictions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
    predicted_home_score INT NOT NULL CHECK (predicted_home_score >= 0),
    predicted_away_score INT NOT NULL CHECK (predicted_away_score >= 0),
    predicted_winner_id BIGINT REFERENCES teams(id) ON DELETE RESTRICT,
    points_earned INT CHECK (points_earned >= 0),
    is_correct_result BOOLEAN,
    is_exact_score BOOLEAN,
    submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (user_id, match_id)
);

CREATE TABLE special_bet_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    points_reward INT NOT NULL CHECK (points_reward > 0),
    bet_type bet_type NOT NULL,
    deadline TIMESTAMPTZ NOT NULL,
    correct_answer JSONB,
    is_resolved BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE special_bet_answers (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES special_bet_categories(id) ON DELETE RESTRICT,
    answer_team_id BIGINT REFERENCES teams(id) ON DELETE RESTRICT,
    answer_player_id BIGINT REFERENCES players(id) ON DELETE RESTRICT,
    answer_number INT,
    answer_boolean BOOLEAN,
    answer_text VARCHAR(255),
    points_earned INT CHECK (points_earned >= 0),
    is_correct BOOLEAN,
    submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (user_id, category_id)
);

CREATE TABLE points_history (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type point_source_type NOT NULL,
    source_id BIGINT NOT NULL,
    points_delta INT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by_admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE polla_config (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    season INT NOT NULL DEFAULT 2026,
    entry_deadline TIMESTAMPTZ NOT NULL,
    prediction_lock_minutes_before_match INT DEFAULT 60 NOT NULL,
    points_exact_score INT DEFAULT 3 NOT NULL,
    points_correct_result INT DEFAULT 1 NOT NULL,
    prize_description TEXT,
    banner_url VARCHAR(255),
    is_registration_open BOOLEAN DEFAULT true NOT NULL,
    max_participants INT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CHECK (id = 1) -- Garantiza que solo exista una configuración global
);

-- INDEXES
CREATE INDEX idx_matches_date ON matches(match_date);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_stage ON matches(stage);
CREATE INDEX idx_match_preds_user ON match_predictions(user_id);
CREATE INDEX idx_match_preds_match ON match_predictions(match_id);
CREATE INDEX idx_special_bets_user ON special_bet_answers(user_id);
CREATE INDEX idx_special_bets_cat ON special_bet_answers(category_id);
CREATE INDEX idx_players_team ON players(team_id);
CREATE INDEX idx_player_stats_player ON player_tournament_stats(player_id);
CREATE INDEX idx_points_hist_user ON points_history(user_id);
CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_date ON activity_log(created_at);

-- MATERIALIZED VIEW: LEADERBOARD
-- Optimizada para lecturas ultra-rápidas en el frontend
CREATE MATERIALIZED VIEW leaderboard AS
SELECT 
    DENSE_RANK() OVER (ORDER BY u.total_points DESC, (
        SELECT COUNT(id) FROM match_predictions WHERE user_id = u.id AND is_exact_score = true
    ) DESC) as posicion,
    u.id as user_id,
    u.username as usuario,
    u.display_name,
    u.avatar_url,
    u.total_points as puntos_totales,
    (SELECT COUNT(id) FROM match_predictions WHERE user_id = u.id AND (is_correct_result = true OR is_exact_score = true)) as predicciones_correctas,
    (SELECT COUNT(id) FROM match_predictions WHERE user_id = u.id AND is_exact_score = true) as marcadores_exactos,
    ARRAY(
        SELECT res FROM (
            SELECT 
                CASE 
                    WHEN p.is_exact_score = true THEN 'E'
                    WHEN p.is_correct_result = true THEN 'W'
                    ELSE 'L'
                END as res
            FROM match_predictions p
            JOIN matches m ON p.match_id = m.id
            WHERE p.user_id = u.id AND m.status = 'finished'
            ORDER BY m.match_date DESC
            LIMIT 5
        ) s
    ) as streak
FROM users u
WHERE u.is_active = true;

CREATE UNIQUE INDEX idx_leaderboard_user ON leaderboard(user_id);
