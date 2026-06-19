import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import LoadingScreen from './LoadingScreen';
import { getTranslatedName } from '../utils/translations';

const getPlayerAvatar = (displayName, userId) => {
  if (!displayName) return `https://api.dicebear.com/7.x/adventurer/svg?seed=DisneyHero${userId}`;
  const nameLower = displayName.toLowerCase();
  
  // List of common female names in our database
  const femaleKeywords = [
    'melissa', 'maria', 'maría', 'silvia', 'luz', 'adriana', 
    'laura', 'esmeralda', 'estefania', 'estefanía', 'isabel', 'jose'
  ];
  
  const firstWord = nameLower.split(' ')[0];
  const isFemale = femaleKeywords.some(kw => nameLower.includes(kw)) || 
                   (firstWord.endsWith('a') && !firstWord.endsWith('uca') && firstWord !== 'andrea');
                   
  const femaleSeeds = ['Elsa', 'Cinderella', 'Ariel', 'Belle', 'Jasmine', 'Mulan', 'Pocahontas', 'Rapunzel'];
  const maleSeeds = ['Hook', 'Simba', 'Aladdin', 'Tarzan', 'Hercules', 'Woody', 'Buzz', 'PeterPan'];
  
  const seedList = isFemale ? femaleSeeds : maleSeeds;
  const seed = seedList[(userId || 0) % seedList.length];
  
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
};

export default function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [selectedUserForPredictions, setSelectedUserForPredictions] = useState(null);
  const [userPredictions, setUserPredictions] = useState([]);
  const [loadingUserPredictions, setLoadingUserPredictions] = useState(false);
  const [predictionsError, setPredictionsError] = useState(null);
  const [predictionsCache, setPredictionsCache] = useState({});
  const prefetchTimeoutRef = useRef({});

  // Cleanup prefetch timers on unmount
  useEffect(() => {
    const timeouts = prefetchTimeoutRef.current;
    return () => {
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  // Auto-scroll to the live or next upcoming match without shifting the main page scrollbar
  useEffect(() => {
    if (!loadingUserPredictions && selectedUserForPredictions && userPredictions.length > 0) {
      let targetIndex = userPredictions.findIndex(pred => pred.match?.status === 'live');
      if (targetIndex === -1) {
        targetIndex = userPredictions.findIndex(pred => pred.match?.status === 'scheduled');
      }
      if (targetIndex !== -1) {
        const timer = setTimeout(() => {
          const container = document.querySelector('.predictions-modal-content');
          const element = document.getElementById(`pred-item-${targetIndex}`);
          if (container && element) {
            const containerTop = container.getBoundingClientRect().top;
            const elementTop = element.getBoundingClientRect().top;
            const relativeTop = elementTop - containerTop;
            const targetScrollTop = container.scrollTop + relativeTop - (container.clientHeight / 2) + (element.clientHeight / 2);
            container.scrollTo({
              top: targetScrollTop,
              behavior: 'smooth'
            });
          }
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [loadingUserPredictions, selectedUserForPredictions, userPredictions]);

  const handleUserClick = async (userId, displayName) => {
    setSelectedUserForPredictions({ id: userId, display_name: displayName });
    
    // Check cache first
    if (predictionsCache[userId]) {
      setUserPredictions(predictionsCache[userId]);
      setPredictionsError(null);
      setLoadingUserPredictions(false);
      return;
    }

    setLoadingUserPredictions(true);
    setPredictionsError(null);
    try {
      const data = await api.get(`/predictions/user/${userId}`);
      const sortedData = data.sort((a, b) => {
        const dateA = new Date(a.match?.match_date || 0);
        const dateB = new Date(b.match?.match_date || 0);
        return dateA - dateB;
      });
      setUserPredictions(sortedData);
      setPredictionsCache(prev => ({ ...prev, [userId]: sortedData }));
    } catch (err) {
      console.error('Error fetching user predictions:', err);
      setPredictionsError('No se pudieron cargar las predicciones.');
    } finally {
      setLoadingUserPredictions(false);
    }
  };

  const handleUserMouseEnter = (userId) => {
    if (predictionsCache[userId]) return;
    
    if (prefetchTimeoutRef.current[userId]) {
      clearTimeout(prefetchTimeoutRef.current[userId]);
    }
    
    prefetchTimeoutRef.current[userId] = setTimeout(async () => {
      try {
        if (predictionsCache[userId]) return;
        const data = await api.get(`/predictions/user/${userId}`);
        const sortedData = data.sort((a, b) => {
          const dateA = new Date(a.match?.match_date || 0);
          const dateB = new Date(b.match?.match_date || 0);
          return dateA - dateB;
        });
        setPredictionsCache(prev => ({ ...prev, [userId]: sortedData }));
      } catch (err) {
        console.error('Error prefetching user predictions:', err);
      } finally {
        delete prefetchTimeoutRef.current[userId];
      }
    }, 150);
  };

  const handleUserMouseLeave = (userId) => {
    if (prefetchTimeoutRef.current[userId]) {
      clearTimeout(prefetchTimeoutRef.current[userId]);
      delete prefetchTimeoutRef.current[userId];
    }
  };

  const renderModalFlag = (logoUrl, countryCode, teamName) => {
    return (
      <img 
        src={logoUrl || (countryCode ? `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png` : 'https://flagcdn.com/w40/un.png')} 
        alt={teamName}
        style={{ width: '24px', height: '16px', objectFit: 'cover', borderRadius: '2px', border: '1px solid rgba(255,255,255,0.1)' }}
        onError={(e) => { e.target.src = 'https://flagcdn.com/w40/un.png'; }}
      />
    );
  };

  useEffect(() => {
    const handleDocumentClick = () => {
      setActiveTooltip(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const handleDotMouseEnter = (userId, index) => {
    if (!activeTooltip || !activeTooltip.isClick) {
      setActiveTooltip({ userId, index, isClick: false });
    }
  };

  const handleDotMouseLeave = () => {
    if (activeTooltip && !activeTooltip.isClick) {
      setActiveTooltip(null);
    }
  };

  const handleDotClick = (e, userId, index) => {
    e.stopPropagation();
    if (activeTooltip && activeTooltip.userId === userId && activeTooltip.index === index && activeTooltip.isClick) {
      setActiveTooltip(null);
    } else {
      setActiveTooltip({ userId, index, isClick: true });
    }
  };

  const renderFlag = (logoUrl, countryCode, teamName) => {
    return (
      <img 
        src={logoUrl || (countryCode ? `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png` : 'https://flagcdn.com/w40/un.png')} 
        alt={teamName}
        className="tooltip-flag"
        onError={(e) => { e.target.src = 'https://flagcdn.com/w40/un.png'; }}
      />
    );
  };

  const getStreakDetail = (s) => {
    if (typeof s === 'object' && s !== null) {
      return s;
    }
    const status = s || 'L';
    const points = status === 'E' ? 5 : status === 'W' ? 3 : 0;
    return {
      status,
      points,
      home_team: 'Partido',
      home_code: '',
      home_logo: '',
      away_team: 'Finalizado',
      away_code: '',
      away_logo: '',
      predicted_home_score: '?',
      predicted_away_score: '?',
      actual_home_score: '?',
      actual_away_score: '?'
    };
  };

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const [lbData, myPreds] = await Promise.all([
          api.get('/leaderboard/'),
          api.get('/predictions/my')
        ]);
        setLeaders(lbData);
        // Filter predictions that have earned points (already finished matches)
        const finishedPreds = myPreds
          .filter(p => p.points_earned !== null)
          .sort((a, b) => a.id - b.id)
          .slice(-8); // Show last 8 results
        setHistory(finishedPreds);
      } catch (err) {
        console.error('Error fetching leaderboard data:', err);
        setError('No se pudo cargar la información');
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);
  const generatePath = () => {
    if (!history || history.length === 0) return "M0,50 L200,50";
    const width = 200;
    const height = 60;
    const padding = 10;
    const step = history.length > 1 ? width / (history.length - 1) : width;
    
    let cumulativePoints = 0;
    const pointsArray = history.map(p => {
      cumulativePoints += p.points_earned || 0;
      return cumulativePoints;
    });

    const maxPoints = Math.max(...pointsArray, 10); // Minimum 10 for scale

    return pointsArray.map((pts, i) => {
      const x = i * step;
      const y = height - padding - ((pts / maxPoints) * (height - 2 * padding));
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
  };

  if (loading) {
    return <LoadingScreen text="RANKING..." />;
  }

  return (
    <div className="view">
      <h1 className="display-text" style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', marginBottom: '2rem' }}>Ranking Global</h1>

      <div className="leaderboard-layout">
        <div className="table-container tilt-card" style={{ transformStyle: 'flat' }}>
          {error ? (
            <div className="error-state">{error}</div>
          ) : (
            <table className="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Participante</th>
                  <th>Racha</th>
                  <th>Partidos</th>
                  <th>Exactos</th>
                  <th>Aciertos</th>
                  <th>Fallos</th>
                  <th>Puntos</th>
                </tr>
              </thead>
              <tbody>
                {leaders.length > 0 ? (
                  leaders.map((entry) => {
                    const progressPercent = entry.matches_total ? Math.round((entry.matches_played / entry.matches_total) * 100) : 0;
                    
                    const renderRank = (pos) => {
                      if (pos === 1) return <div className="rank-badge rank-1-badge" title="1er Puesto">🥇</div>;
                      if (pos === 2) return <div className="rank-badge rank-2-badge" title="2do Puesto">🥈</div>;
                      if (pos === 3) return <div className="rank-badge rank-3-badge" title="3er Puesto">🥉</div>;
                      return pos;
                    };

                    return (
                      <tr 
                        key={entry.user_id}
                        style={activeTooltip && activeTooltip.userId === entry.user_id ? { position: 'relative', zIndex: 10 } : {}}
                      >
                        <td className="rank" style={{ textAlign: 'center', verticalAlign: 'middle' }}>{renderRank(entry.position)}</td>
                        <td>
                          <div className="user-cell">
                            <button 
                              onClick={() => handleUserClick(entry.user_id, entry.user.display_name)}
                              onMouseEnter={() => handleUserMouseEnter(entry.user_id)}
                              onMouseLeave={() => handleUserMouseLeave(entry.user_id)}
                              className="username-btn unified"
                              title="Ver desglose de predicciones"
                            >
                              <img 
                                src={entry.user.avatar_url || getPlayerAvatar(entry.user.display_name, entry.user_id)} 
                                alt={entry.user.display_name} 
                                className={`u-avatar ${entry.position === 1 ? 'avatar-gold-border' : ''}`}
                                onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${entry.user.display_name}`; }}
                              />
                              <span>{entry.user.display_name}</span>
                              <span className="username-btn-icon">👁️</span>
                            </button>
                          </div>
                        </td>
                        <td style={activeTooltip && activeTooltip.userId === entry.user_id ? { position: 'relative', zIndex: 15, verticalAlign: 'middle' } : { verticalAlign: 'middle' }}>
                          <div className="streak">
                            {entry.streak && entry.streak.length > 0 ? (
                              entry.streak.map((s, i) => {
                                const detail = getStreakDetail(s);
                                const isVisible = activeTooltip && 
                                  activeTooltip.userId === entry.user_id && 
                                  activeTooltip.index === i;
                                const isDown = entry.position <= 2;
                                const alignClass = i === 0 ? 'tooltip-left-align' : (i >= 3 ? 'tooltip-right-align' : '');
                                return (
                                  <div 
                                    key={i} 
                                    className={`dot streak-${detail.status.toLowerCase()}`}
                                    onClick={(e) => handleDotClick(e, entry.user_id, i)}
                                    onMouseEnter={() => handleDotMouseEnter(entry.user_id, i)}
                                    onMouseLeave={handleDotMouseLeave}
                                    style={{ position: 'relative', cursor: 'pointer', zIndex: isVisible ? 20 : 1 }}
                                  >
                                    <div className={`dot-tooltip ${isVisible ? 'visible' : ''} ${isDown ? 'tooltip-down' : ''} ${alignClass}`}>
                                      <div className="tooltip-header">
                                        <span className={`tooltip-badge badge-${detail.status.toLowerCase()}`}>
                                          {detail.status === 'E' ? 'Exacto' : detail.status === 'W' ? 'Acierto' : 'Fallo'}
                                        </span>
                                        <span className={`tooltip-points points-${detail.status.toLowerCase()}`}>
                                          {detail.points > 0 ? `+${detail.points}` : detail.points} pts
                                        </span>
                                      </div>
                                      <div className="tooltip-match-info">
                                        <div className="tooltip-teams">
                                          <div className="tooltip-team-row">
                                            {renderFlag(detail.home_logo, detail.home_code, detail.home_team)}
                                            <span>{getTranslatedName(detail.home_team)}</span>
                                          </div>
                                          <span className="tooltip-vs">vs</span>
                                          <div className="tooltip-team-row">
                                            {renderFlag(detail.away_logo, detail.away_code, detail.away_team)}
                                            <span>{getTranslatedName(detail.away_team)}</span>
                                          </div>
                                        </div>
                                        <div className="tooltip-scores">
                                          <div className="score-block">
                                            <span className="score-label">PRED</span>
                                            <span className={`score-value score-${detail.status.toLowerCase()}`}>
                                              {detail.predicted_home_score} - {detail.predicted_away_score}
                                            </span>
                                          </div>
                                          <div className="score-divider"></div>
                                          <div className="score-block">
                                            <span className="score-label">REAL</span>
                                            <span className="score-value highlight">{detail.actual_home_score} - {detail.actual_away_score}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <span style={{color: 'var(--text-gray)', fontSize: '0.8rem'}}>Sin predicciones</span>
                            )}
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                          <div className="progress-container-mini">
                            <span className="progress-text-mini">{entry.matches_played}/{entry.matches_total}</span>
                            <div className="progress-bar-track-mini">
                              <div className="progress-bar-fill-mini" style={{ width: `${progressPercent}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                          <span className="badge-stat badge-stat-green" title="Marcadores Exactos (5 pts)">
                            <span className="badge-stat-icon">★</span>
                            {entry.exact_count || 0}
                          </span>
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                          <span className="badge-stat badge-stat-gold" title="Predicciones Acertadas (3 pts)">
                            <span className="badge-stat-icon">✓</span>
                            {(entry.correct_count || 0) - (entry.exact_count || 0)}
                          </span>
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                          <span className="badge-stat badge-stat-red" title="Predicciones Falladas">
                            <span className="badge-stat-icon">✗</span>
                            {entry.failed_count || 0}
                          </span>
                        </td>
                        <td className="pts-cell" style={{ verticalAlign: 'middle' }}>{entry.total_points}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No hay datos disponibles</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="rules-panel tilt-card">
          <h3>Sistema de Puntos</h3>
          <div className="rule-item">
            <span>Resultado Exacto<br /><small style={{ color: 'var(--text-gray)' }}>Ej: Predices 2-0, termina 2-0</small></span>
            <strong>+5</strong>
          </div>
          <div className="rule-item">
            <span>Acierto Ganador/Empate<br /><small style={{ color: 'var(--text-gray)' }}>Ej: Predices 2-0, termina 1-0</small></span>
            <strong>+3</strong>
          </div>
          <div className="rule-item">
            <span>Fallo<br /><small style={{ color: 'var(--text-gray)' }}>Ej: Predices local, gana visita</small></span>
            <strong style={{ color: 'var(--red)' }}>0</strong>
          </div>

          <div className="chart-mock">
            <div className="chart-title">Tu Desempeño (Puntos Acumulados)</div>
            {history.length > 0 ? (
              <svg viewBox="0 0 200 60" style={{ width: '100%', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path 
                  d={generatePath()} 
                  fill="none" 
                  stroke="var(--gold)" 
                  strokeWidth="3" 
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="drop-shadow(0px 5px 10px rgba(201,168,76,0.3))" 
                />
                <path 
                  d={`${generatePath()} L${200},60 L0,60 Z`} 
                  fill="url(#chartGradient)" 
                  stroke="none" 
                />
                {history.map((p, i) => {
                  const width = 200;
                  const height = 60;
                  const padding = 10;
                  const step = history.length > 1 ? width / (history.length - 1) : width;
                  let pointsSoFar = 0;
                  for(let j=0; j<=i; j++) pointsSoFar += history[j].points_earned || 0;
                  const maxPoints = Math.max(...history.reduce((acc, curr) => {
                    const last = acc.length > 0 ? acc[acc.length-1] : 0;
                    acc.push(last + (curr.points_earned || 0));
                    return acc;
                  }, []), 10);

                  const x = i * step;
                  const y = height - padding - ((pointsSoFar / maxPoints) * (height - 2 * padding));
                  return (
                    <circle key={i} cx={x} cy={y} r="3" fill="var(--bg-white)" stroke="var(--gold)" strokeWidth="2">
                      <title>{`+${p.points_earned} pts (Total: ${pointsSoFar})`}</title>
                    </circle>
                  );
                })}
              </svg>
            ) : (
              <div style={{color: 'var(--text-gray)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px'}}>
                Acierta partidos para ver tu progreso
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedUserForPredictions && createPortal(
        <div 
          className="predictions-modal-overlay" 
          onClick={() => setSelectedUserForPredictions(null)}
        >
          <div 
            className="predictions-modal" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="predictions-modal-header">
              <h2 className="predictions-modal-title">
                Predicciones de {selectedUserForPredictions.display_name}
              </h2>
              <button 
                className="predictions-modal-close" 
                onClick={() => setSelectedUserForPredictions(null)}
              >
                &times;
              </button>
            </div>
            
            <div className="predictions-modal-content">
              {loadingUserPredictions ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem' }}>
                  <div className="loading-spinner" style={{ border: '4px solid rgba(255,255,255,0.1)', borderLeftColor: 'var(--gold)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }}></div>
                  <span style={{ color: 'var(--text-gray)', fontWeight: 600 }}>Cargando predicciones...</span>
                </div>
              ) : predictionsError ? (
                <div style={{ color: 'var(--red)', textAlign: 'center', padding: '2rem', fontWeight: 600 }}>
                  {predictionsError}
                </div>
              ) : userPredictions.length === 0 ? (
                <div style={{ color: 'var(--text-gray)', textAlign: 'center', padding: '2rem', fontWeight: 600 }}>
                  No se encontraron predicciones registradas.
                </div>
              ) : (
                <div className="predictions-modal-list">
                  {userPredictions.map((pred, idx) => {
                    let statusClass = 'pending';
                    let statusLabel = 'Pendiente';
                    
                     if (pred.points_earned !== null) {
                       if (pred.is_exact_score || pred.points_earned >= 5) {
                         statusClass = 'exact';
                         statusLabel = 'Exacto';
                       } else if (pred.is_correct_result || (pred.points_earned > 0 && pred.points_earned < 5)) {
                         statusClass = 'correct';
                         statusLabel = 'Acierto';
                       } else {
                         statusClass = 'fail';
                         statusLabel = 'Fallo';
                       }
                     }
                    
                    const formatMatchDate = (dateStr) => {
                      if (!dateStr) return '';
                      const d = new Date(dateStr);
                      return d.toLocaleDateString('es-ES', { 
                        day: '2-digit', 
                        month: 'short', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      });
                    };

                    const getStageTranslation = (stage) => {
                      const stages = {
                        'group': 'Fase de Grupos',
                        'round_of_32': 'Dieciseisavos',
                        'round_of_16': 'Octavos de Final',
                        'quarterfinal': 'Cuartos de Final',
                        'semifinal': 'Semifinal',
                        'third_place': 'Tercer Puesto',
                        'final': 'Final'
                      };
                      return stages[stage] || stage;
                    };
                    
                    return (
                      <div key={pred.id} id={`pred-item-${idx}`} className={`prediction-item ${statusClass}`}>
                        <div className="prediction-match-details">
                          <span className="prediction-stage">
                            {getStageTranslation(pred.match?.stage)} | {formatMatchDate(pred.match?.match_date)}
                          </span>
                          <div className="prediction-teams" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {renderModalFlag(pred.match?.home_team?.logo_url, pred.match?.home_team?.country_code, pred.match?.home_team?.name)}
                            <span>{getTranslatedName(pred.match?.home_team?.name)}</span>
                            <span className="prediction-vs">vs</span>
                            {renderModalFlag(pred.match?.away_team?.logo_url, pred.match?.away_team?.country_code, pred.match?.away_team?.name)}
                            <span>{getTranslatedName(pred.match?.away_team?.name)}</span>
                          </div>
                        </div>
                        
                        <div className="prediction-scores-comparison">
                          <div className="pred-score-block">
                            <span className="pred-score-label">Predicho</span>
                            <span className="pred-score-value">
                              {pred.predicted_home_score} - {pred.predicted_away_score}
                            </span>
                          </div>
                          
                          <div className="pred-score-block">
                            <span className="pred-score-label">Real</span>
                            <span className="pred-score-value pred-score-value-real">
                              {pred.match?.status?.toLowerCase() === 'finished' || pred.match?.status?.toLowerCase() === 'live' ? (
                                `${pred.match.home_score} - ${pred.match.away_score}`
                              ) : (
                                '- - -'
                              )}
                            </span>
                          </div>
                        </div>
                        
                        <div className="prediction-points-badge">
                          <span className={`pred-points-val pts-${statusClass}`}>
                            {pred.points_earned !== null ? `+${pred.points_earned}` : '--'}
                          </span>
                          <span className="pred-points-label">
                            {pred.points_earned !== null ? 'puntos' : statusLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

