import enum

class UserRole(str, enum.Enum):
    admin = "admin"
    participant = "participant"

class ConfederationType(str, enum.Enum):
    UEFA = "UEFA"
    CONMEBOL = "CONMEBOL"
    CONCACAF = "CONCACAF"
    CAF = "CAF"
    AFC = "AFC"
    OFC = "OFC"

class MatchStage(str, enum.Enum):
    group = "group"
    round_of_32 = "round_of_32"
    round_of_16 = "round_of_16"
    quarterfinal = "quarterfinal"
    semifinal = "semifinal"
    third_place = "third_place"
    final = "final"

class MatchStatus(str, enum.Enum):
    scheduled = "scheduled"
    live = "live"
    finished = "finished"
    postponed = "postponed"

class PlayerPosition(str, enum.Enum):
    goalkeeper = "goalkeeper"
    defender = "defender"
    midfielder = "midfielder"
    forward = "forward"

class EventType(str, enum.Enum):
    goal = "goal"
    own_goal = "own_goal"
    yellow_card = "yellow_card"
    red_card = "red_card"
    substitution = "substitution"
    penalty_scored = "penalty_scored"
    penalty_missed = "penalty_missed"

class BetType(str, enum.Enum):
    team = "team"
    player = "player"
    number = "number"
    boolean = "boolean"
    text = "text"

class PointSourceType(str, enum.Enum):
    match_prediction = "match_prediction"
    special_bet = "special_bet"
    manual_adjustment = "manual_adjustment"
