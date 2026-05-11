-- seed.sql

-- 1. Configuration
INSERT INTO polla_config (id, name, description, season, entry_deadline, prediction_lock_minutes_before_match, points_exact_score, points_correct_result, prize_description)
VALUES (1, 'Polla Mundial 2026', 'La gran polla del Mundial Norteamérica 2026', 2026, '2026-06-11 00:00:00+00', 60, 3, 1, '1er Lugar: 50%, 2do Lugar: 30%, 3er Lugar: 20%')
ON CONFLICT DO NOTHING;

-- 2. Users (Hashed passwords example: "password123")
INSERT INTO users (username, email, hashed_password, display_name, role)
VALUES 
('admin_master', 'admin@polla2026.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Administrador', 'admin'),
('mateo_r', 'mateo@example.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Mateo R.', 'participant');

-- 3. Groups (12 groups A to L)
INSERT INTO groups (name) VALUES 
('A'), ('B'), ('C'), ('D'), ('E'), ('F'), ('G'), ('H'), ('I'), ('J'), ('K'), ('L');

-- 4. Stadiums (16 host cities: 11 USA, 3 Mexico, 2 Canada)
INSERT INTO stadiums (name, city, country, capacity) VALUES
('Estadio Azteca', 'Mexico City', 'Mexico', 83264),
('Estadio Akron', 'Guadalajara', 'Mexico', 46232),
('Estadio BBVA', 'Monterrey', 'Mexico', 51000),
('BMO Field', 'Toronto', 'Canada', 30000),
('BC Place', 'Vancouver', 'Canada', 54000),
('MetLife Stadium', 'New York/New Jersey', 'USA', 82500),
('AT&T Stadium', 'Dallas', 'USA', 80000),
('Arrowhead Stadium', 'Kansas City', 'USA', 76416),
('NRG Stadium', 'Houston', 'USA', 72220),
('Mercedes-Benz Stadium', 'Atlanta', 'USA', 71000),
('SoFi Stadium', 'Los Angeles', 'USA', 70240),
('Lincoln Financial Field', 'Philadelphia', 'USA', 69796),
('Lumen Field', 'Seattle', 'USA', 69000),
('Levi''s Stadium', 'San Francisco Bay Area', 'USA', 68500),
('Gillette Stadium', 'Boston', 'USA', 65878),
('Hard Rock Stadium', 'Miami', 'USA', 64767);

-- 5. Teams (48 teams distributed in 12 groups based on plausible qualifiers)
INSERT INTO teams (name, country_code, flag_emoji, confederation, group_id) VALUES
('Mexico', 'MX', '🇲🇽', 'CONCACAF', 1), ('Poland', 'PL', '🇵🇱', 'UEFA', 1), ('Egypt', 'EG', '🇪🇬', 'CAF', 1), ('New Zealand', 'NZ', '🇳🇿', 'OFC', 1),
('USA', 'US', '🇺🇸', 'CONCACAF', 2), ('England', 'GB', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'UEFA', 2), ('Iran', 'IR', '🇮🇷', 'AFC', 2), ('Wales', 'WL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'UEFA', 2),
('Canada', 'CA', '🇨🇦', 'CONCACAF', 3), ('France', 'FR', '🇫🇷', 'UEFA', 3), ('Morocco', 'MA', '🇲🇦', 'CAF', 3), ('Australia', 'AU', '🇦🇺', 'AFC', 3),
('Argentina', 'AR', '🇦🇷', 'CONMEBOL', 4), ('Saudi Arabia', 'SA', '🇸🇦', 'AFC', 4), ('Sweden', 'SE', '🇸🇪', 'UEFA', 4), ('Nigeria', 'NG', '🇳🇬', 'CAF', 4),
('Brazil', 'BR', '🇧🇷', 'CONMEBOL', 5), ('Serbia', 'RS', '🇷🇸', 'UEFA', 5), ('Japan', 'JP', '🇯🇵', 'AFC', 5), ('Costa Rica', 'CR', '🇨🇷', 'CONCACAF', 5),
('Spain', 'ES', '🇪🇸', 'UEFA', 6), ('Colombia', 'CO', '🇨🇴', 'CONMEBOL', 6), ('South Korea', 'KR', '🇰🇷', 'AFC', 6), ('Ivory Coast', 'CI', '🇨🇮', 'CAF', 6),
('Germany', 'DE', '🇩🇪', 'UEFA', 7), ('Uruguay', 'UY', '🇺🇾', 'CONMEBOL', 7), ('Senegal', 'SN', '🇸🇳', 'CAF', 7), ('Panama', 'PA', '🇵🇦', 'CONCACAF', 7),
('Portugal', 'PT', '🇵🇹', 'UEFA', 8), ('Ecuador', 'EC', '🇪🇨', 'CONMEBOL', 8), ('Algeria', 'DZ', '🇩🇿', 'CAF', 8), ('Qatar', 'QA', '🇶🇦', 'AFC', 8),
('Netherlands', 'NL', '🇳🇱', 'UEFA', 9), ('Chile', 'CL', '🇨🇱', 'CONMEBOL', 9), ('Ghana', 'GH', '🇬🇭', 'CAF', 9), ('Honduras', 'HN', '🇭🇳', 'CONCACAF', 9),
('Italy', 'IT', '🇮🇹', 'UEFA', 10), ('Peru', 'PE', '🇵🇪', 'CONMEBOL', 10), ('Cameroon', 'CM', '🇨🇲', 'CAF', 10), ('Jamaica', 'JM', '🇯🇲', 'CONCACAF', 10),
('Belgium', 'BE', '🇧🇪', 'UEFA', 11), ('Paraguay', 'PY', '🇵🇾', 'CONMEBOL', 11), ('Mali', 'ML', '🇲🇱', 'CAF', 11), ('UAE', 'AE', '🇦🇪', 'AFC', 11),
('Croatia', 'HR', '🇭🇷', 'UEFA', 12), ('Venezuela', 'VE', '🇻🇪', 'CONMEBOL', 12), ('Tunisia', 'TN', '🇹🇳', 'CAF', 12), ('Oman', 'OM', '🇴🇲', 'AFC', 12);

-- 6. Special Bet Categories
INSERT INTO special_bet_categories (name, description, points_reward, bet_type, deadline) VALUES
('Campeón del Mundial', '¿Qué selección levantará la copa?', 15, 'team', '2026-06-11 00:00:00+00'),
('Subcampeón', 'Equipo que perderá la final', 10, 'team', '2026-06-11 00:00:00+00'),
('Tercer lugar', 'Ganador del partido por el tercer puesto', 8, 'team', '2026-06-11 00:00:00+00'),
('Balón de Oro', 'Mejor jugador del torneo', 12, 'player', '2026-06-11 00:00:00+00'),
('Bota de Oro', 'Máximo goleador', 12, 'player', '2026-06-11 00:00:00+00'),
('Guante de Oro', 'Mejor portero', 10, 'player', '2026-06-11 00:00:00+00'),
('Sorpresa del torneo', 'Equipo revelación que llegará más lejos de lo esperado', 8, 'team', '2026-06-11 00:00:00+00'),
('Decepción del torneo', 'Favorito que caerá temprano', 8, 'team', '2026-06-11 00:00:00+00'),
('Total de goles', 'Suma total de goles marcados en los 104 partidos', 10, 'number', '2026-06-11 00:00:00+00'),
('¿Prórroga en la final?', '¿El partido final irá a tiempo extra?', 5, 'boolean', '2026-06-11 00:00:00+00');
