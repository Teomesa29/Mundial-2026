import { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { getTranslatedName } from '../utils/translations';
import copaLogo from '../assets/copa.png';
import LoadingScreen from './LoadingScreen';

const BRACKET_STRUCTURE = {
  round_of_32: Array.from({ length: 16 }, (_, i) => ({ id: i + 1, nextMatchId: Math.floor(i / 2) + 17, isHome: i % 2 === 0 })),
  round_of_16: Array.from({ length: 8 }, (_, i) => ({ id: i + 17, nextMatchId: Math.floor(i / 2) + 25, isHome: i % 2 === 0 })),
  quarterfinal: Array.from({ length: 4 }, (_, i) => ({ id: i + 25, nextMatchId: Math.floor(i / 2) + 29, isHome: i % 2 === 0 })),
  semifinal: Array.from({ length: 2 }, (_, i) => ({ id: i + 29, nextMatchId: 31, isHome: i % 2 === 0 })),
  final: [{ id: 31, nextMatchId: null, isHome: true }],
  third_place: [{ id: 32, nextMatchId: null, isHome: true }]
};

const STAGE_TO_BRACKET_IDS = {
  round_of_32: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  round_of_16: [17, 18, 19, 20, 21, 22, 23, 24],
  quarterfinal: [25, 26, 27, 28],
  semifinal: [29, 30],
  final: [31],
  third_place: [32]
};


const MATCH_NUM_TO_BRACKET_ID = {
  // Round of 32
  75: 1, 78: 2, 73: 3, 76: 4, 84: 5, 83: 6, 82: 7, 81: 8,
  74: 9, 77: 10, 79: 11, 80: 12, 87: 13, 86: 14, 85: 15, 88: 16,
  // Round of 16
  89: 17, 90: 18, 93: 19, 94: 20, 91: 21, 92: 22, 95: 23, 96: 24,
  // Quarterfinals
  97: 25, 98: 26, 99: 27, 100: 28,
  // Semifinals
  101: 29, 102: 30,
  // Final & Third Place
  104: 31, 103: 32
};

let notificationCounter = 0;

export default function BracketPredictor({ navigateTo, userRole, adminUserId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const addNotification = (title, msg, type = 'success') => {
    const id = ++notificationCounter;
    setNotifications(prev => [...prev, { id, title, msg, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const [bracketState, setBracketState] = useState({});
  const [config, setConfig] = useState(null);
  const [bracketReady, setBracketReady] = useState({ is_ready: false });

  useEffect(() => {
    const calculatePoints = (predHome, predAway, realHome, realAway, predWinnerId, homeTeamId, awayTeamId, realHomePen, realAwayPen) => {
      if (predHome === '' || predAway === '' || realHome == null || realAway == null) return 0;

      const isExact = (predHome === realHome && predAway === realAway);

      const realWinner = realHome > realAway ? 'home' : realAway > realHome ? 'away' : 'draw';
      const predWinner = predHome > predAway ? 'home' : predAway > predHome ? 'away' : 'draw';
      const isCorrectResult = (realWinner === predWinner);

      let points = 0;
      const realIsDraw = (realHome === realAway);
      const predIsDraw = (predHome === predAway);

      if (realIsDraw) {
        let realWinnerId = null;
        if (realHomePen != null && realAwayPen != null) {
          realWinnerId = realHomePen > realAwayPen ? homeTeamId : awayTeamId;
        }

        let userWinnerId;
        if (predHome > predAway) userWinnerId = homeTeamId;
        else if (predAway > predHome) userWinnerId = awayTeamId;
        else userWinnerId = predWinnerId;

        if (isExact) {
          points = 5;
        } else {
          if (predIsDraw) {
            points = 3;
          } else {
            points = 0;
          }
        }
      } else {
        if (isExact) {
          points = 5;
        } else if (isCorrectResult) {
          points = 3;
        }
      }

      return points;
    };

    const fetchData = async () => {
      try {
        const [matchesData, bracketResponse, configData, statusData] = await Promise.all([
          api.get('/matches/', { cache: false }),
          api.get('/predictions/bracket' + (adminUserId ? `?user_id=${adminUserId}` : ''), { cache: false }),
          api.get('/matches/config', { cache: false }),
          api.get('/matches/bracket-status', { cache: false })
        ]);

        setBracketReady(statusData);
        setConfig(configData);

        let newState = {};
        for (let i = 1; i <= 32; i++) {
          newState[i] = {
            home: null,
            away: null,
            predicted_home: '',
            predicted_away: '',
            predicted_winner_id: null,
            is_finished: false,
            points: null,
            real_home: null,
            real_away: null,
            real_home_penalties: null,
            real_away_penalties: null,
            match_id: null
          };
        }

        const knockoutMatches = matchesData.filter(m => m.stage !== 'group');
        knockoutMatches.forEach(match => {
          const bracketId = MATCH_NUM_TO_BRACKET_ID[match.match_number];
          if (bracketId && newState[bracketId]) {
            newState[bracketId].match_id = match.id;
            newState[bracketId].is_finished = match.status === 'finished' || match.status === 'FINISHED';
            newState[bracketId].real_home = match.home_score;
            newState[bracketId].real_away = match.away_score;
            newState[bracketId].real_home_penalties = match.home_score_penalties;
            newState[bracketId].real_away_penalties = match.away_score_penalties;
            newState[bracketId].match_date = match.match_date;
            newState[bracketId].home = match.home_team;
            newState[bracketId].away = match.away_team;
          }
        });

        const savedData = bracketResponse?.bracket_data || {};
        Object.keys(savedData).forEach(idStr => {
          const bracketId = parseInt(idStr);
          if (newState[bracketId]) {
            const savedMatch = savedData[idStr];
            newState[bracketId].predicted_home = savedMatch.predicted_home ?? '';
            newState[bracketId].predicted_away = savedMatch.predicted_away ?? '';
            newState[bracketId].predicted_winner_id = savedMatch.predicted_winner_id ?? null;
          }
        });

        Object.keys(newState).forEach(idStr => {
          const bracketId = parseInt(idStr);
          const match = newState[bracketId];
          if (match.is_finished && match.real_home != null && match.real_away != null) {
            match.points = calculatePoints(
              match.predicted_home,
              match.predicted_away,
              match.real_home,
              match.real_away,
              match.predicted_winner_id,
              match.home?.id,
              match.away?.id,
              match.real_home_penalties,
              match.real_away_penalties
            );
          }
        });

        setBracketState(newState);
      } catch (err) {
        console.error('Error fetching bracket data:', err);
        setError('Error al cargar la fase de finalistas.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const isGlobalLocked = () => {
    if (userRole === 'admin') return false;
    if (!config) return false;
    if (!config.is_bracket_open) return true;
    return false;
  };

  const isLocked = isGlobalLocked();

  const isMatchLocked = (matchData) => {
    if (userRole === 'admin') return false;
    if (isLocked) return true;
    if (!matchData?.match_date) return false;
    const matchTime = new Date(matchData.match_date);
    return new Date() >= matchTime;
  };

  const handleScoreChange = (matchId, team, value) => {
    if (isLocked) return;
    const currentMatch = bracketState[matchId];
    if (isMatchLocked(currentMatch)) return;
    setBracketState(prev => {
      const updatedMatch = {
        ...prev[matchId],
        [team]: value === '' ? '' : parseInt(value)
      };

      if (updatedMatch.predicted_home !== '' && updatedMatch.predicted_away !== '') {
        if (updatedMatch.predicted_home > updatedMatch.predicted_away) {
          updatedMatch.predicted_winner_id = updatedMatch.home?.id;
        } else if (updatedMatch.predicted_away > updatedMatch.predicted_home) {
          updatedMatch.predicted_winner_id = updatedMatch.away?.id;
        } else {
          if (updatedMatch.predicted_winner_id !== updatedMatch.home?.id && updatedMatch.predicted_winner_id !== updatedMatch.away?.id) {
            updatedMatch.predicted_winner_id = updatedMatch.home?.id;
          }
        }
      } else {
        updatedMatch.predicted_winner_id = null;
      }

      const tempState = {
        ...prev,
        [matchId]: updatedMatch
      };

      return tempState;
    });
  };

  const handleSelectWinner = (matchId, teamId) => {
    if (isLocked) return;
    const currentMatch = bracketState[matchId];
    if (isMatchLocked(currentMatch)) return;
    setBracketState(prev => {
      const match = prev[matchId];
      if (match.predicted_home === '' || match.predicted_away === '') return prev;
      if (match.predicted_home !== match.predicted_away) return prev;

      const updatedMatch = {
        ...match,
        predicted_winner_id: teamId
      };

      const tempState = {
        ...prev,
        [matchId]: updatedMatch
      };

      return tempState;
    });
  };

  const handleSave = async (isAuto = false) => {
    if (!isAuto) {
      setSaving(true);
      setError(null);
      setSuccess(null);
    }

    try {
      const minifiedData = {};
      Object.entries(bracketState).forEach(([id, match]) => {
        minifiedData[id] = {
          predicted_home: match.predicted_home,
          predicted_away: match.predicted_away,
          predicted_winner_id: match.predicted_winner_id
        };
      });

      await api.post('/predictions/bracket' + (adminUserId ? `?user_id=${adminUserId}` : ''), { bracket_data: minifiedData });
      if (!isAuto) {
        addNotification('¡Guardado!', 'Tus pronósticos de la fase final se han guardado exitosamente.', 'success');
      }
    } catch (err) {
      console.error('Error saving bracket:', err);
      if (!isAuto) {
        addNotification('Error', err.message || 'Error al guardar las llaves.', 'error');
      }
    } finally {
      if (!isAuto) setSaving(false);
    }
  };

  const initialLoadRef = useRef(true);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    if (isLocked) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSave(true);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bracketState]);

  const getFlagUrl = (team) => {
    if (!team) return 'https://flagcdn.com/w80/un.png';
    return team.logo_url || (team.country_code ? `https://flagcdn.com/w80/${team.country_code.toLowerCase()}.png` : 'https://flagcdn.com/w80/un.png');
  };

  const renderMatch = (matchDef, isRightSide = false) => {
    const matchData = bracketState[matchDef.id] || { home: null, away: null, predicted_home: '', predicted_away: '', is_finished: false, points: null };
    const homeTeam = matchData.home;
    const awayTeam = matchData.away;
    const isDisabled = !homeTeam || !awayTeam;
    const isFinished = matchData.is_finished;
    const points = matchData.points;
    const realHome = matchData.real_home;
    const realAway = matchData.real_away;
    const realHomePen = matchData.real_home_penalties;
    const realAwayPen = matchData.real_away_penalties;

    const isM_Locked = isMatchLocked(matchData);

    const matchDate = matchData.match_date ? new Date(matchData.match_date) : null;
    const formattedDate = matchDate && !isNaN(matchDate.getTime())
      ? `${matchDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ${matchDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
      : null;
    const showDate = matchDef.id <= 16 && formattedDate;

    let statusClass = 'interactive';
    if (isDisabled) {
      statusClass = 'waiting-stage';
    } else if (isFinished) {
      if (points >= 4) statusClass = 'state-exact';
      else if (points >= 1) statusClass = 'state-result';
      else statusClass = 'state-fail';
    } else if (isM_Locked) {
      statusClass = 'locked-match';
    }

    const renderTeamRow = (team, isHome) => {
      const scoreKey = isHome ? 'predicted_home' : 'predicted_away';
      const scoreValue = matchData[scoreKey] ?? '';

      // Determine border radius to look nice with footer/header
      const borderTopRadius = (isHome && !showDate) ? '14px' : '0';
      const borderBottomRadius = (!isHome && !isFinished) ? '14px' : '0';

      const rowStyle = {
        padding: '0.6rem 0.8rem',
        display: 'flex',
        alignItems: 'center',
        minHeight: '44px',
        borderTop: !isHome ? '1px solid rgba(0,0,0,0.05)' : 'none',
        borderTopLeftRadius: borderTopRadius,
        borderTopRightRadius: borderTopRadius,
        borderBottomLeftRadius: borderBottomRadius,
        borderBottomRightRadius: borderBottomRadius
      };

      if (isRightSide) {
        const isWinner = team && matchData.predicted_home !== '' && matchData.predicted_home === matchData.predicted_away && matchData.predicted_winner_id === team.id;
        const isCursorPointer = team && !isDisabled && !isLocked && !isM_Locked && matchData.predicted_home !== '' && matchData.predicted_home === matchData.predicted_away;

        return (
          <div
            className={`bm-team ${isWinner ? 'winner' : ''}`}
            onClick={() => team && !isM_Locked && handleSelectWinner(matchDef.id, team.id)}
            style={{
              ...rowStyle,
              cursor: isCursorPointer ? 'pointer' : 'default',
              background: isWinner ? 'rgba(201, 168, 76, 0.05)' : 'none'
            }}
          >
            {!isDisabled ? (
              isFinished ? (
                <div style={{
                  width: '38px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  marginRight: 'auto',
                  color: 'var(--bg-dark)',
                  background: 'rgba(0,0,0,0.06)',
                  borderRadius: '6px'
                }}>
                  {scoreValue !== '' ? scoreValue : '-'}
                </div>
              ) : (
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="bm-score-input"
                  value={scoreValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d+$/.test(val)) {
                      handleScoreChange(matchDef.id, scoreKey, val);
                    }
                  }}
                  placeholder="-"
                  readOnly={isLocked || isM_Locked}
                  style={{ width: '38px', height: '26px', border: '1px solid #ccc', borderRadius: '6px', textAlign: 'center', fontSize: '0.95rem', fontWeight: 'bold', marginRight: 'auto', background: isM_Locked ? '#eaeaea' : '#fff', color: '#000', outline: 'none' }}
                />
              )
            ) : (
              <div style={{ width: '38px', height: '26px', marginRight: 'auto' }}></div>
            )}

            {isWinner && (
              <i className="ri-vip-crown-fill" style={{ color: '#D4AF37', marginRight: '0.4rem', fontSize: '0.9rem' }} title="Ganador de penales elegido"></i>
            )}

            <span className="bm-name" style={{
              fontSize: '0.88rem',
              fontWeight: isWinner ? 800 : 700,
              color: team ? (isWinner ? 'var(--gold-dark)' : '#111') : '#888',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              textAlign: 'right',
              marginRight: '0.8rem'
            }}>
              {team ? getTranslatedName(team.name) : 'TBD'}
            </span>
            <div className="bm-flag" style={{ width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(0,0,0,0.08)' }}>
              <img src={getFlagUrl(team)} alt={team?.name || 'TBD'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
        );
      } else {
        const isWinner = team && matchData.predicted_home !== '' && matchData.predicted_home === matchData.predicted_away && matchData.predicted_winner_id === team.id;
        const isCursorPointer = team && !isDisabled && !isLocked && !isM_Locked && matchData.predicted_home !== '' && matchData.predicted_home === matchData.predicted_away;

        return (
          <div
            className={`bm-team ${isWinner ? 'winner' : ''}`}
            onClick={() => team && !isM_Locked && handleSelectWinner(matchDef.id, team.id)}
            style={{
              ...rowStyle,
              cursor: isCursorPointer ? 'pointer' : 'default',
              background: isWinner ? 'rgba(201, 168, 76, 0.05)' : 'none'
            }}
          >
            <div className="bm-flag" style={{ width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, marginRight: '0.8rem', border: '1px solid rgba(0,0,0,0.08)' }}>
              <img src={getFlagUrl(team)} alt={team?.name || 'TBD'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            <span className="bm-name" style={{
              fontSize: '0.88rem',
              fontWeight: isWinner ? 800 : 700,
              color: team ? (isWinner ? 'var(--gold-dark)' : '#111') : '#888',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1
            }}>
              {team ? getTranslatedName(team.name) : 'TBD'}
            </span>

            {isWinner && (
              <i className="ri-vip-crown-fill" style={{ color: '#D4AF37', marginLeft: '0.4rem', fontSize: '0.9rem' }} title="Ganador de penales elegido"></i>
            )}

            {!isDisabled && (
              isFinished ? (
                <div style={{
                  width: '38px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  marginLeft: 'auto',
                  color: 'var(--bg-dark)',
                  background: 'rgba(0,0,0,0.06)',
                  borderRadius: '6px'
                }}>
                  {scoreValue !== '' ? scoreValue : '-'}
                </div>
              ) : (
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="bm-score-input"
                  value={scoreValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d+$/.test(val)) {
                      handleScoreChange(matchDef.id, scoreKey, val);
                    }
                  }}
                  placeholder="-"
                  readOnly={isLocked || isM_Locked}
                  style={{ width: '38px', height: '26px', border: '1px solid #ccc', borderRadius: '6px', textAlign: 'center', fontSize: '0.95rem', fontWeight: 'bold', marginLeft: 'auto', background: isM_Locked ? '#eaeaea' : '#fff', color: '#000', outline: 'none' }}
                />
              )
            )}
          </div>
        );
      }
    };

    return (
      <div className={`bracket-match-card ${statusClass}`} key={matchDef.id} style={{ display: 'flex', flexDirection: 'column' }}>
        {showDate && (
          <div style={{
            fontSize: '0.65rem',
            textAlign: 'center',
            background: 'rgba(0,0,0,0.04)',
            padding: '3px 0',
            borderTopLeftRadius: '14px',
            borderTopRightRadius: '14px',
            color: 'var(--text-gray)',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {formattedDate}
          </div>
        )}
        {renderTeamRow(homeTeam, true)}
        {renderTeamRow(awayTeam, false)}

        {isFinished && (
          <div className="match-card-footer" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.4rem 0.8rem',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            background: 'rgba(0,0,0,0.02)',
            fontSize: '0.75rem',
            fontWeight: 800,
            borderBottomLeftRadius: '14px',
            borderBottomRightRadius: '14px'
          }}>
            <span style={{ color: 'var(--text-gray)' }}>
              Real: <strong style={{ color: '#111' }}>
                {realHome} - {realAway}
                {realHomePen != null && realAwayPen != null && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', marginLeft: '0.2rem', fontWeight: 600 }}>
                    ({realHomePen} - {realAwayPen} pen)
                  </span>
                )}
              </strong>
            </span>
            <span className="points-badge" style={{
              padding: '0.15rem 0.5rem',
              borderRadius: '10px',
              fontSize: '0.7rem',
              fontWeight: 800,
              color: points >= 4 ? 'var(--green)' : points >= 1 ? '#B58900' : 'var(--red)',
              background: points >= 4 ? 'rgba(45, 106, 79, 0.12)' : points >= 1 ? 'rgba(255, 193, 7, 0.15)' : 'rgba(230, 57, 70, 0.12)'
            }}>
              {points === 0 ? '0 pts' : `+${points} pts`}
            </span>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <LoadingScreen text="CARGANDO LLAVES..." />;

  if (!bracketReady?.is_ready && !config?.is_bracket_open) {
    return (
      <div className="view" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', minHeight: '60vh' }}>
        <div style={{
          background: 'rgba(201, 168, 76, 0.1)',
          border: '1px solid rgba(201, 168, 76, 0.3)',
          padding: '3rem',
          borderRadius: '30px',
          maxWidth: '600px',
          boxShadow: 'var(--shadow-soft)'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #C9A84C, #917631)',
            color: 'white',
            width: '80px',
            height: '80px',
            borderRadius: '25px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            margin: '0 auto 2rem',
            boxShadow: '0 10px 20px rgba(201, 168, 76, 0.2)'
          }}>
            <i className="ri-time-line"></i>
          </div>
          <h2 className="display-text" style={{ fontSize: '2rem', color: 'var(--bg-dark)', marginBottom: '1rem' }}>Fase Final en Espera</h2>
          <p style={{ color: 'var(--text-gray)', fontWeight: 600, fontSize: '1.05rem', lineHeight: '1.6', marginBottom: '2rem' }}>
            Las llaves interactivas de la fase final se habilitarán automáticamente una vez que todos los equipos clasificados de la fase de grupos estén definidos oficialmente.
          </p>
          <button className="btn btn-primary" onClick={() => navigateTo && navigateTo('dashboard')} style={{ padding: '0.8rem 2rem', borderRadius: '12px' }}>
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="view bracket-predictor-view">
      {adminUserId && (
        <div style={{
          backgroundColor: '#ff4d4f',
          color: 'white',
          padding: '1rem',
          textAlign: 'center',
          fontWeight: 'bold',
          borderRadius: '8px',
          margin: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          boxShadow: '0 4px 6px rgba(255, 77, 79, 0.3)'
        }}>
          <i className="ri-error-warning-line" style={{fontSize: '1.2rem'}}></i>
          <span>MODO DE EMERGENCIA: Estás modificando las llaves de otro usuario. Por favor, asegúrate de que sea necesario.</span>
        </div>
      )}
      <div className="bracket-header-nav">
      {/* Notifications Portal */}
      <div className="notification-container">
        {notifications.map(n => (
          <div key={n.id} className={`notification ${n.type}`}>
            <div className="notification-icon">
              {n.type === 'success' ? <i className="ri-checkbox-circle-fill" style={{ color: 'var(--green)' }}></i> :
                n.type === 'error' ? <i className="ri-error-warning-fill" style={{ color: 'var(--red)' }}></i> :
                  <i className="ri-time-fill" style={{ color: 'var(--gold)' }}></i>}
            </div>
            <div className="notification-content">
              <span className="notification-title">{n.title}</span>
              <span className="notification-msg">{n.msg}</span>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .bracket-predictor-view {
          max-width: 100%;
          overflow-x: hidden !important;
          padding-bottom: 8rem !important;
        }
        .bracket-scroll-wrapper {
          width: 100%;
          max-width: 100%;
          overflow-x: auto !important;
        }
        .waiting-stage {
          opacity: 0.4;
          filter: grayscale(100%);
          background: rgba(220, 220, 220, 0.35) !important;
          border: 1px dashed rgba(0,0,0,0.15) !important;
          pointer-events: none;
        }
        .locked-match {
          border: 1px solid rgba(0,0,0,0.15) !important;
          background: rgba(240, 240, 240, 0.6) !important;
          box-shadow: none !important;
        }
        .interactive {
          border: 1px solid rgba(201,168,76,0.4) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06) !important;
        }
        .interactive:hover {
          border-color: var(--gold) !important;
          transform: translateY(-2px) scale(1.02) !important;
          box-shadow: 0 8px 20px rgba(201, 168, 76, 0.15) !important;
        }
        .bracket-match-card {
          width: 200px !important;
          border-radius: 14px !important;
          margin-bottom: 0.8rem !important;
          background: rgba(255, 255, 255, 0.95);
          overflow: visible !important;
          transition: 0.3s;
          border: 2px solid transparent;
        }
        
        /* State styles matching the group phase */
        .bracket-match-card.state-exact {
          border: 2px solid var(--green) !important;
          background: linear-gradient(to bottom right, rgba(255, 255, 255, 0.98), rgba(45, 106, 79, 0.05)) !important;
          box-shadow: 0 4px 15px rgba(45, 106, 79, 0.12) !important;
        }
        .bracket-match-card.state-result {
          border: 2px solid #FFC107 !important;
          background: linear-gradient(to bottom right, rgba(255, 255, 255, 0.98), rgba(255, 193, 7, 0.05)) !important;
          box-shadow: 0 4px 15px rgba(255, 193, 7, 0.12) !important;
        }
        .bracket-match-card.state-fail {
          border: 2px solid var(--red) !important;
          background: linear-gradient(to bottom right, rgba(255, 255, 255, 0.98), rgba(230, 57, 70, 0.05)) !important;
          box-shadow: 0 4px 15px rgba(230, 57, 70, 0.12) !important;
        }
        
        .bracket-match-card .bm-team:first-child {
          border-top-left-radius: 14px !important;
          border-top-right-radius: 14px !important;
        }
        .bracket-match-card .bm-team:last-child {
          border-bottom-left-radius: 14px !important;
          border-bottom-right-radius: 14px !important;
        }
        .knockout-tree-container {
          gap: 2rem !important;
          padding: 2rem 0 !important;
          min-width: 1950px !important;
          margin: 0 auto;
          overflow-x: visible !important;
        }
        .bracket-side {
          gap: 2rem !important;
        }
        .bracket-side.right {
          flex-direction: row !important;
        }
        .bracket-scroll-wrapper::-webkit-scrollbar {
          height: 8px;
        }
        .bracket-scroll-wrapper::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 4px;
        }
        .bracket-scroll-wrapper::-webkit-scrollbar-thumb {
          background: var(--gold);
          border-radius: 4px;
        }
        /* Hide HTML5 Number Spinners */
        .bm-score-input::-webkit-outer-spin-button,
        .bm-score-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .bm-score-input {
          -moz-appearance: textfield;
        }
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.6; }
          100% { transform: scale(1.05); opacity: 0.9; }
        }
        @media (max-width: 768px) {
          .mobile-scroll-hint {
            display: block !important;
          }
        }
        
        /* Sticky Bottom Save Bar */
        .bracket-sticky-footer {
          position: sticky;
          bottom: 1rem;
          margin-top: 3rem;
          background: rgba(10, 17, 24, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 3px solid var(--gold);
          padding: 1rem 2rem;
          border-radius: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 100;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
          max-width: 90%;
          margin-left: auto;
          margin-right: auto;
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp {
          from { transform: translateY(50px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (max-width: 768px) {
          .bracket-sticky-footer {
            flex-direction: column;
            gap: 1rem;
            padding: 1.2rem;
            bottom: 80px; /* Space above mobile navigation */
            text-align: center;
            max-width: 95%;
          }
        }

        /* Bracket Connection Lines */
        .bracket-match-card {
          position: relative;
        }
        
        /* Incoming horizontal lines for left side cards */
        .bracket-side.left .bracket-column:not(.stage-round_of_32) .bracket-match-card::before {
          content: "";
          position: absolute;
          left: -20px;
          top: 50%;
          width: 20px;
          height: 2px;
          background: rgba(201, 168, 76, 0.35);
          pointer-events: none;
        }
        
        /* Outgoing lines for left side Column 1 (16vos -> Octavos) */
        .bracket-side.left .stage-round_of_32 .bracket-match-card:nth-child(odd)::after {
          content: "";
          position: absolute;
          right: -20px;
          top: 50%;
          width: 20px;
          height: 56px;
          border-right: 2px solid rgba(201, 168, 76, 0.35);
          border-top: 2px solid rgba(201, 168, 76, 0.35);
          border-top-right-radius: 6px;
          pointer-events: none;
        }
        .bracket-side.left .stage-round_of_32 .bracket-match-card:nth-child(even)::after {
          content: "";
          position: absolute;
          right: -20px;
          bottom: 50%;
          width: 20px;
          height: 56px;
          border-right: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom-right-radius: 6px;
          pointer-events: none;
        }
        
        /* Outgoing lines for left side Column 2 (Octavos -> Cuartos) */
        .bracket-side.left .stage-round_of_16 .bracket-match-card:nth-child(odd)::after {
          content: "";
          position: absolute;
          right: -20px;
          top: 50%;
          width: 20px;
          height: 112px;
          border-right: 2px solid rgba(201, 168, 76, 0.35);
          border-top: 2px solid rgba(201, 168, 76, 0.35);
          border-top-right-radius: 6px;
          pointer-events: none;
        }
        .bracket-side.left .stage-round_of_16 .bracket-match-card:nth-child(even)::after {
          content: "";
          position: absolute;
          right: -20px;
          bottom: 50%;
          width: 20px;
          height: 112px;
          border-right: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom-right-radius: 6px;
          pointer-events: none;
        }
        
        /* Outgoing lines for left side Column 3 (Cuartos -> Semis) */
        .bracket-side.left .stage-quarterfinal .bracket-match-card:nth-child(odd)::after {
          content: "";
          position: absolute;
          right: -20px;
          top: 50%;
          width: 20px;
          height: 224px;
          border-right: 2px solid rgba(201, 168, 76, 0.35);
          border-top: 2px solid rgba(201, 168, 76, 0.35);
          border-top-right-radius: 6px;
          pointer-events: none;
        }
        .bracket-side.left .stage-quarterfinal .bracket-match-card:nth-child(even)::after {
          content: "";
          position: absolute;
          right: -20px;
          bottom: 50%;
          width: 20px;
          height: 224px;
          border-right: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom-right-radius: 6px;
          pointer-events: none;
        }
        
        /* Outgoing lines for left side Column 4 (Semis -> Final) */
        .bracket-side.left .stage-semifinal .bracket-match-card::after {
          content: "";
          position: absolute;
          right: -40px;
          top: 50%;
          width: 40px;
          height: 2px;
          background: rgba(201, 168, 76, 0.35);
          pointer-events: none;
        }

        /* RIGHT SIDE CONNECTIONS (Mirrored) */
        /* Incoming horizontal lines from the right for right side cards */
        .bracket-side.right .bracket-column:not(.stage-round_of_32) .bracket-match-card::before {
          content: "";
          position: absolute;
          right: -20px;
          top: 50%;
          width: 20px;
          height: 2px;
          background: rgba(201, 168, 76, 0.35);
          pointer-events: none;
        }
        
        /* Outgoing lines for right side Column 4 (16vos -> Octavos) */
        .bracket-side.right .stage-round_of_32 .bracket-match-card:nth-child(odd)::after {
          content: "";
          position: absolute;
          left: -20px;
          top: 50%;
          width: 20px;
          height: 56px;
          border-left: 2px solid rgba(201, 168, 76, 0.35);
          border-top: 2px solid rgba(201, 168, 76, 0.35);
          border-top-left-radius: 6px;
          pointer-events: none;
        }
        .bracket-side.right .stage-round_of_32 .bracket-match-card:nth-child(even)::after {
          content: "";
          position: absolute;
          left: -20px;
          bottom: 50%;
          width: 20px;
          height: 56px;
          border-left: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom-left-radius: 6px;
          pointer-events: none;
        }
        
        /* Outgoing lines for right side Column 3 (Octavos -> Cuartos) */
        .bracket-side.right .stage-round_of_16 .bracket-match-card:nth-child(odd)::after {
          content: "";
          position: absolute;
          left: -20px;
          top: 50%;
          width: 20px;
          height: 112px;
          border-left: 2px solid rgba(201, 168, 76, 0.35);
          border-top: 2px solid rgba(201, 168, 76, 0.35);
          border-top-left-radius: 6px;
          pointer-events: none;
        }
        .bracket-side.right .stage-round_of_16 .bracket-match-card:nth-child(even)::after {
          content: "";
          position: absolute;
          left: -20px;
          bottom: 50%;
          width: 20px;
          height: 112px;
          border-left: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom-left-radius: 6px;
          pointer-events: none;
        }
        
        /* Outgoing lines for right side Column 2 (Cuartos -> Semis) */
        .bracket-side.right .stage-quarterfinal .bracket-match-card:nth-child(odd)::after {
          content: "";
          position: absolute;
          left: -20px;
          top: 50%;
          width: 20px;
          height: 224px;
          border-left: 2px solid rgba(201, 168, 76, 0.35);
          border-top: 2px solid rgba(201, 168, 76, 0.35);
          border-top-left-radius: 6px;
          pointer-events: none;
        }
        .bracket-side.right .stage-quarterfinal .bracket-match-card:nth-child(even)::after {
          content: "";
          position: absolute;
          left: -20px;
          bottom: 50%;
          width: 20px;
          height: 224px;
          border-left: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom: 2px solid rgba(201, 168, 76, 0.35);
          border-bottom-left-radius: 6px;
          pointer-events: none;
        }
        
        /* Outgoing lines for right side Column 1 (Semis -> Final) */
        .bracket-side.right .stage-semifinal .bracket-match-card::after {
          content: "";
          position: absolute;
          left: -40px;
          top: 50%;
          width: 40px;
          height: 2px;
          background: rgba(201, 168, 76, 0.35);
          pointer-events: none;
        }
        /* Save Button Animation */
        .btn-saving-anim {
          transform: scale(0.98);
          opacity: 0.9;
        }
        .btn-glow-overlay {
          position: absolute;
          top: 0; left: -100%;
          width: 50%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
          animation: sweep 1.5s infinite;
          z-index: 1;
        }
        @keyframes sweep {
          0% { left: -100%; }
          100% { left: 200%; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="display-text" style={{ fontSize: 'clamp(2.5rem, 8vw, 4.5rem)', margin: 0, color: 'var(--bg-dark)' }}>Predicciones</h1>
          <p style={{ color: 'var(--text-gray)', fontWeight: 600, marginTop: '-0.5rem' }}>Ingresa tus resultados gol a gol para la fase eliminatoria</p>
        </div>
        <div className="filters" style={{ marginBottom: 0 }}>
          <button
            className="filter-btn"
            onClick={() => {
              localStorage.setItem('predictionsActiveTab', 'list');
              navigateTo && navigateTo('predictions');
            }}
          >
            <i className="ri-list-check" style={{ marginRight: '0.5rem' }}></i>
            Fase grupos
          </button>
          <button
            className="filter-btn"
            onClick={() => {
              localStorage.setItem('predictionsActiveTab', 'forecast');
              navigateTo && navigateTo('predictions');
            }}
          >
            <i className="ri-table-line" style={{ marginRight: '0.5rem' }}></i>
            Tabla posiciones
          </button>
          <button className="filter-btn active">
            <i className="ri-organization-chart" style={{ marginRight: '0.5rem' }}></i>
            Finalistas
          </button>
        </div>
      </div>

      {error && <div className="toast toast-error">{error}</div>}
      {success && <div className="toast toast-success">{success}</div>}

      {isLocked && (
        <div className="alert-banner" style={{
          background: 'rgba(255, 107, 107, 0.1)',
          border: '2px solid var(--red)',
          color: 'var(--red)',
          padding: '1.5rem',
          borderRadius: '20px',
          marginBottom: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontWeight: 700
        }}>
          <i className="ri-lock-fill" style={{ fontSize: '2rem' }}></i>
          <div>
            <div style={{ fontSize: '1.1rem' }}>Predicciones bloqueadas o cerradas</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Las predicciones para la fase final han sido bloqueadas por el administrador o el plazo de inscripción ha vencido.</div>
          </div>
        </div>
      )}

      <div className="mobile-scroll-hint" style={{ display: 'none', textAlign: 'center', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', padding: '0.8rem 1rem', borderRadius: '10px', color: 'var(--gold-dark)', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 700 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', animation: 'pulse 1.5s infinite' }}>
          <i className="ri-arrow-left-right-line"></i> Desliza horizontalmente para ver el árbol completo
        </span>
      </div>

      <div className="bracket-scroll-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '1.5rem' }}>
        <div className="knockout-tree-container interactive-tree">
          <div className="bracket-side left">
            {['round_of_32', 'round_of_16', 'quarterfinal', 'semifinal'].map(stage => {
              const matches = BRACKET_STRUCTURE[stage];
              const half = matches.slice(0, matches.length / 2);
              return (
                <div key={`left-${stage}`} className={`bracket-column stage-${stage}`}>
                  <h4 style={{ color: 'var(--gold)', textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.5rem', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    {stage === 'round_of_32' ? '16vos' : stage === 'round_of_16' ? 'Octavos' : stage === 'quarterfinal' ? 'Cuartos' : 'Semis'}
                  </h4>
                  <div className="matches-column">
                    {half.map(m => renderMatch(m, false))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bracket-center">
            <div className="final-stage" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', position: 'relative' }}>
              <h3 className="column-label" style={{ textAlign: 'center', color: 'var(--gold)', marginBottom: '1.5rem', fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', textShadow: '0 0 10px rgba(201,168,76,0.3)' }}>GRAN FINAL</h3>

              <div className="trophy-display-premium" style={{ position: 'relative', width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                {/* Golden Radial Glow */}
                <div style={{
                  position: 'absolute',
                  width: '160px',
                  height: '160px',
                  background: 'radial-gradient(circle, rgba(201,168,76,0.4) 0%, transparent 70%)',
                  filter: 'blur(15px)',
                  animation: 'pulse 2s infinite alternate',
                  zIndex: 1
                }}></div>

                {/* Rotating Conic Rays */}
                <div className="rays-mini" style={{
                  position: 'absolute',
                  width: '240px',
                  height: '240px',
                  background: 'repeating-conic-gradient(from 0deg, rgba(201,168,76,0.1) 0deg 1deg, transparent 6deg 12deg)',
                  animation: 'rotate 30s linear infinite',
                  opacity: 0.8,
                  zIndex: 2,
                  pointerEvents: 'none'
                }}></div>

                <img
                  src={copaLogo}
                  style={{
                    width: '100px',
                    height: 'auto',
                    filter: 'drop-shadow(0 0 20px rgba(201, 168, 76, 0.6))',
                    animation: 'float 3s ease-in-out infinite',
                    zIndex: 3,
                    position: 'relative'
                  }}
                  alt="Copa del Mundo"
                />
              </div>
              {renderMatch(BRACKET_STRUCTURE.final[0], false)}

              <div className="third-place-stage" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '2rem', width: '100%' }}>
                <h4 style={{ color: 'var(--gold)', textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.5rem', textShadow: '0 2px 4px rgba(0,0,0,0.1)', letterSpacing: '1px' }}>TERCER PUESTO</h4>
                {renderMatch(BRACKET_STRUCTURE.third_place[0], false)}
              </div>
            </div>
          </div>

          <div className="bracket-side right" style={{ flexDirection: 'row' }}>
            {['semifinal', 'quarterfinal', 'round_of_16', 'round_of_32'].map(stage => {
              const matches = BRACKET_STRUCTURE[stage];
              const half = matches.slice(matches.length / 2);
              return (
                <div key={`right-${stage}`} className={`bracket-column stage-${stage}`}>
                  <h4 style={{ color: 'var(--gold)', textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.5rem', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    {stage === 'round_of_32' ? '16vos' : stage === 'round_of_16' ? 'Octavos' : stage === 'quarterfinal' ? 'Cuartos' : 'Semis'}
                  </h4>
                  <div className="matches-column">
                    {half.map(m => renderMatch(m, true))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Save Bar */}
      {!isLocked && (
        <div className="bracket-sticky-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <span style={{ color: 'white', fontWeight: 800, fontSize: '1.2rem', fontFamily: 'var(--font-display)', letterSpacing: '1px' }}>TUS PRONÓSTICOS</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontWeight: 500 }}>Recuerda guardar tus resultados de la fase final antes de salir.</span>
            </div>
          </div>
          <button
            className={`btn btn-primary ${saving ? 'btn-saving-anim' : ''}`}
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{
              padding: '0.8rem 2.5rem',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              boxShadow: saving ? '0 0 20px rgba(201, 168, 76, 0.8)' : '0 4px 15px rgba(201, 168, 76, 0.3)',
              borderRadius: '12px',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {saving && <div className="btn-glow-overlay"></div>}
            {saving ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative', zIndex: 2 }}>
                <i className="ri-loader-4-line rotate" style={{ fontSize: '1.2rem' }}></i> Guardando...
              </span>
            ) : (
              <span style={{ position: 'relative', zIndex: 2 }}>Guardar Pronósticos</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
