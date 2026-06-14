import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { getTranslatedName, getTranslatedStage } from '../utils/translations';
import LoadingScreen from './LoadingScreen';

export default function Predictions({ userRole, navigateTo }) {
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [saveMessage, setSaveMessage] = useState({}); // {matchId: 'message'}
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'forecast'
  const [forecast, setForecast] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [matchesData, predsData, configData] = await Promise.all([
          api.get('/matches/'),
          api.get('/predictions/my'),
          api.get('/matches/config')
        ]);
        setMatches(matchesData);
        setConfig(configData);

        const predsObj = {};
        predsData.forEach(p => {
          predsObj[p.match_id] = {
            home: p.predicted_home_score,
            away: p.predicted_away_score,
            points: p.points_earned,
            id: p.id
          };
        });
        setPredictions(predsObj);
      } catch (err) {
        console.error('Error fetching predictions data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const isGlobalLocked = () => {
    if (!config) return false;
    if (!config.is_registration_open) return true;
    if (config.entry_deadline) {
      const deadline = new Date(config.entry_deadline);
      return new Date() > deadline;
    }
    return false;
  };

  const isLocked = isGlobalLocked();

  if (loading) {
    return <LoadingScreen text="PREDICCIONES..." />;
  }

  const handleScoreChange = (matchId, team, value) => {
    if (isLocked) return;
    setPredictions(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [team]: value === '' ? '' : parseInt(value)
      }
    }));
  };

  const handleSave = async (matchId) => {
    if (isLocked) return;
    const pred = predictions[matchId];
    if (!pred) return;

    // ── Optimistic UI: respond immediately, sync in background ──
    const currentPreds = { ...predictions };
    const tempId = pred.id || `temp-${matchId}`;

    setPredictions(prev => ({ ...prev, [matchId]: { ...prev[matchId], id: tempId } }));
    setSaveMessage(prev => ({ ...prev, [matchId]: '¡Guardado!' }));
    setTimeout(() => setSaveMessage(prev => ({ ...prev, [matchId]: null })), 2000);

    try {
      const response = await api.post('/predictions/', {
        match_id: matchId,
        predicted_home_score: pred.home,
        predicted_away_score: pred.away
      });
      // Confirm with real ID from server and flush stale cache
      api.invalidate('/predictions');
      api.invalidate('/predictions/forecast'); // Refresh forecast data
      setForecast([]); // Force re-fetch on next tab change
      setPredictions(prev => ({ ...prev, [matchId]: { ...prev[matchId], id: response.id } }));
    } catch (err) {
      // Revert on failure
      setPredictions(currentPreds);
      setSaveMessage(prev => ({ ...prev, [matchId]: `Error: ${err.message}` }));
      setTimeout(() => setSaveMessage(prev => ({ ...prev, [matchId]: null })), 3000);
    }
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === 'forecast' && (forecast.length === 0 || api.isStale('/predictions/forecast'))) {
      fetchForecast();
    }
  };

  const fetchForecast = async () => {
    setForecastLoading(true);
    try {
      const data = await api.get('/predictions/forecast');
      setForecast(data);
    } catch (err) {
      console.error('Error fetching forecast:', err);
    } finally {
      setForecastLoading(false);
    }
  };

  const getStatusClass = (match, pred) => {
    if (match.status !== 'finished') return 'state-pending';
    if (!pred) return 'state-fail';

    // Heuristic: points >= 4 usually means exact result in most configs
    // points between 1 and 3 usually means correct winner but not exact
    if (pred.points >= 4) return 'state-exact';
    if (pred.points >= 1) return 'state-result';
    return 'state-fail';
  };

  return (
    <div className="view">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="display-text" style={{ fontSize: 'clamp(2.5rem, 8vw, 4.5rem)', margin: 0, color: 'var(--bg-dark)' }}>Predicciones</h1>
          <p style={{ color: 'var(--text-gray)', fontWeight: 600, marginTop: '-0.5rem' }}>Define tus resultados y mira cómo queda la tabla</p>
        </div>
        <div className="filters" style={{ marginBottom: 0 }}>
          <button
            className={`filter-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => handleTabChange('list')}
          >
            <i className="ri-list-check" style={{ marginRight: '0.5rem' }}></i>
            Partidos
          </button>
          <button
            className={`filter-btn ${activeTab === 'forecast' ? 'active' : ''}`}
            onClick={() => handleTabChange('forecast')}
          >
            <i className="ri-table-line" style={{ marginRight: '0.5rem' }}></i>
            Simulador Tablas
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Cargando tus datos...</div>
      ) : (
        <>
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
              <i className="ri-error-warning-fill" style={{ fontSize: '2rem' }}></i>
              <div>
                <div style={{ fontSize: '1.1rem' }}>El periodo de predicciones ha finalizado</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Ya no es posible modificar tus resultados. Contacta al administrador si crees que es un error.</div>
              </div>
            </div>
          )}

          <div className="pred-progress" style={{ 
            background: 'var(--bg-white)', 
            padding: '2rem', 
            borderRadius: '24px', 
            marginBottom: '3rem', 
            boxShadow: 'var(--shadow-soft)',
            border: '1px solid rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, #C9A84C, #917631)', 
                  color: 'white', 
                  width: '50px', 
                  height: '50px', 
                  borderRadius: '15px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '1.6rem',
                  boxShadow: '0 8px 15px rgba(201, 168, 76, 0.2)'
                }}>
                  <i className="ri-trophy-fill"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: 'var(--bg-dark)' }}>Tu Progreso</h3>
                  <p style={{ margin: 0, color: 'var(--text-gray)', fontWeight: 600, fontSize: '0.95rem' }}>
                    {Object.keys(predictions).length} de {matches.length} partidos pronosticados
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ 
                  fontSize: '2.5rem', 
                  fontWeight: 900, 
                  color: '#2D6A4F',
                  display: 'block',
                  lineHeight: 1
                }}>
                  {Math.round((Object.keys(predictions).length / (matches.length || 1)) * 100)}%
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-gray)', textTransform: 'uppercase', letterSpacing: '1px' }}>Completado</span>
              </div>
            </div>
            
            {/* Contenedor de la barra - Aseguramos visibilidad con colores sólidos primero */}
            <div style={{ 
              height: '14px', 
              width: '100%',
              background: '#E9ECEF', 
              borderRadius: '10px', 
              overflow: 'hidden',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                background: '#2D6A4F',
                width: `${Math.min(100, Math.round((Object.keys(predictions).length / (matches.length || 1)) * 100))}%`,
                transition: 'width 1s ease-in-out',
                borderRadius: '10px'
              }}></div>
            </div>
          </div>

          {activeTab === 'list' ? (
            <div className="predictions-groups">
              {Object.entries(
                matches.reduce((acc, match) => {
                  const groupKey = getTranslatedStage(match.stage, match.group_name);
                  if (!acc[groupKey]) acc[groupKey] = [];
                  acc[groupKey].push(match);
                  return acc;
                }, {})
              )
                .sort((a, b) => {
                  const priority = {
                    'Grupo A': 1, 'Grupo B': 2, 'Grupo C': 3, 'Grupo D': 4,
                    'Grupo E': 5, 'Grupo F': 6, 'Grupo G': 7, 'Grupo H': 8,
                    'Dieciseisavos': 9, 'Octavos de Final': 10, 'Cuartos de Final': 11,
                    'Semifinal': 12, 'Tercer Puesto': 13, 'Final': 14
                  };
                  return (priority[a[0]] || 99) - (priority[b[0]] || 99);
                })
                .map(([groupKey, groupMatches]) => (
                  <div key={groupKey} style={{ marginBottom: '4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                      <div style={{ height: '2px', flex: 1, background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.05))' }}></div>
                      <h2 className="display-text" style={{
                        fontSize: '2.5rem',
                        margin: 0,
                        color: 'var(--bg-dark)',
                        opacity: 0.8
                      }}>
                        {groupKey}
                      </h2>
                      <div style={{ height: '2px', flex: 1, background: 'linear-gradient(90deg, rgba(0,0,0,0.05), transparent)' }}></div>
                    </div>
                    <div className="pred-grid">
                      {[...groupMatches]
                        .sort((a, b) => {
                          const dateA = new Date(a.match_date || a.utc_date).getTime();
                          const dateB = new Date(b.match_date || b.utc_date).getTime();
                          return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
                        })
                        .map(match => {
                        const pred = predictions[match.id];
                        const isSaving = savingId === match.id;
                        const statusText = match.status === 'scheduled' || match.status === 'TIMED' || match.status === 'SCHEDULED' ? 'Pendiente' :
                          match.status === 'live' || match.status === 'IN_PLAY' || match.status === 'PAUSED' ? 'En Vivo' : 'Finalizado';

                        return (
                          <div key={match.id} className={`pred-card ${getStatusClass(match, pred)} tilt-card`} style={{ borderRadius: '24px', padding: '1.5rem', position: 'relative' }}>
                            <div className="pred-status">
                              {pred?.points != null ? (pred.points === 0 ? '0 pts' : `+${pred.points} pts`) : pred ? 'Esperando resultado' : statusText}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '1.5rem' }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-gray)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {(() => {
                                  const d = new Date(match.match_date || match.utc_date);
                                  return isNaN(d.getTime()) ? 'Por definir' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                                })()}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 700 }}>
                                <i className="ri-map-pin-2-fill"></i> {match.stadium?.name || 'Por definir'}
                              </div>
                            </div>

                            <div className="pred-match" style={{ marginBottom: '1.5rem', alignItems: 'center' }}>
                              <div className="pred-team">
                                <div className="bm-flag" style={{ width: '56px', height: '56px', marginBottom: '0.75rem', boxShadow: '0 8px 20px rgba(0,0,0,0.12)', border: '2px solid white' }}>
                                  <img
                                    src={match.home_team?.logo_url || (match.home_team?.country_code ? `https://flagcdn.com/w80/${match.home_team.country_code.toLowerCase()}.png` : '')}
                                    alt={match.home_team?.name}
                                    onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
                                  />
                                </div>
                                <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--bg-dark)' }}>{getTranslatedName(match.home_team?.name)}</span>
                              </div>

                              <div className="score-inputs-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="score-inputs" style={{ gap: '0.4rem' }}>
                                  <input
                                    type="number"
                                    className={`score-input ${(match.status === 'scheduled' && !isLocked) ? 'pred-editable' : ''}`}
                                    value={pred?.home ?? ''}
                                    onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)}
                                    readOnly={match.status !== 'scheduled' || isLocked}
                                    placeholder="-"
                                    style={{ fontSize: '1.8rem', width: '55px', height: '65px', borderRadius: '14px' }}
                                  />
                                  <span className="score-divider" style={{ fontSize: '1.5rem', opacity: 0.3, fontWeight: 900 }}>-</span>
                                  <input
                                    type="number"
                                    className={`score-input ${(match.status === 'scheduled' && !isLocked) ? 'pred-editable' : ''}`}
                                    value={pred?.away ?? ''}
                                    onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)}
                                    readOnly={match.status !== 'scheduled' || isLocked}
                                    placeholder="-"
                                    style={{ fontSize: '1.8rem', width: '55px', height: '65px', borderRadius: '14px' }}
                                  />
                                </div>
                              </div>

                              <div className="pred-team">
                                <div className="bm-flag" style={{ width: '56px', height: '56px', marginBottom: '0.75rem', boxShadow: '0 8px 20px rgba(0,0,0,0.12)', border: '2px solid white' }}>
                                  <img
                                    src={match.away_team?.logo_url || (match.away_team?.country_code ? `https://flagcdn.com/w80/${match.away_team.country_code.toLowerCase()}.png` : '')}
                                    alt={match.away_team?.name}
                                    onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
                                  />
                                </div>
                                <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--bg-dark)' }}>{getTranslatedName(match.away_team?.name)}</span>
                              </div>
                            </div>

                            {match.status === 'finished' && (
                              <div className="real-result" style={{ background: 'rgba(0,0,0,0.04)', padding: '0.75rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center', color: 'var(--text-gray)' }}>
                                <span style={{ opacity: 0.6 }}>RESULTADO REAL:</span> {match.home_score} - {match.away_score}
                              </div>
                            )}

                            {match.status === 'scheduled' && !isLocked && (
                              <button
                                className={`btn-primary ${pred?.id ? 'btn-outline' : ''}`}
                                style={{ width: '100%', padding: '1rem', justifyContent: 'center', marginTop: '1rem', borderRadius: '16px', fontSize: '0.9rem', fontWeight: 800 }}
                                onClick={() => handleSave(match.id)}
                                disabled={isSaving}
                              >
                                {isSaving ? (
                                  <><i className="ri-loader-4-line rotate" style={{marginRight: '8px'}}></i> Guardando...</>
                                ) : (
                                  saveMessage[match.id] || (pred?.id ? 'Actualizar Pronóstico' : 'Guardar Pronóstico')
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="forecast-view">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 className="display-text" style={{ fontSize: '2.5rem', margin: 0 }}>Simulación de Tablas</h2>
                <button className="filter-btn" onClick={fetchForecast} disabled={forecastLoading}>
                  <i className={`ri-refresh-line ${forecastLoading ? 'rotate' : ''}`}></i> Actualizar
                </button>
              </div>

              {forecastLoading ? (
                <div style={{ textAlign: 'center', padding: '5rem', background: 'var(--bg-white)', borderRadius: '30px', boxShadow: 'var(--shadow-soft)' }}>
                  <div className="live-dot" style={{ marginBottom: '1.5rem', width: '20px', height: '20px' }}></div>
                  <p className="display-text" style={{ fontSize: '1.5rem' }}>Calculando posiciones según tus pronósticos...</p>
                </div>
              ) : (
                <div className="forecast-grid">
                  {forecast.map((group) => (
                    <div key={group.group_id} className="group-forecast-section" style={{ 
                      marginBottom: '3rem', 
                      background: 'white', 
                      borderRadius: '28px', 
                      padding: '2rem', 
                      boxShadow: '0 10px 40px rgba(0,0,0,0.05)',
                      border: '1px solid rgba(0,0,0,0.03)'
                    }}>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--bg-dark)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ width: '8px', height: '32px', background: 'var(--gold)', borderRadius: '4px' }}></span>
                        {group.group_name}
                      </h3>
                      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {/* Simulation Table */}
                        <div style={{ flex: '1 1 500px' }}>
                          <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--gold)', marginBottom: '1rem', textTransform: 'uppercase' }}>
                            <i className="ri-magic-line"></i> Tu Simulación
                          </h4>
                          <div className="table-responsive" style={{ borderRadius: '18px', overflowX: 'auto', border: '1px solid rgba(0,0,0,0.05)', WebkitOverflowScrolling: 'touch' }}>
                            <table className="forecast-table" style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Pos</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Equipo</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 900, color: 'var(--gold)', whiteSpace: 'nowrap' }}>PTS</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>PJ</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>G</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>E</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>P</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>GF</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>GC</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>DG</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.standings.map((team, idx) => (
                                  <tr key={team.team_id} style={{ borderBottom: '1px solid #f0f0f0', transition: 'background 0.2s' }}>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'left', fontWeight: 800, color: idx < 2 ? 'var(--gold)' : 'var(--text-gray)', whiteSpace: 'nowrap' }}>
                                      {idx + 1}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.6rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div className="bm-flag" style={{ width: '28px', height: '28px', flexShrink: 0, boxShadow: '0 4px 10px rgba(0,0,0,0.1)', border: '1px solid white' }}>
                                          <img 
                                            src={team.logo_url || (team.country_code ? `https://flagcdn.com/w80/${team.country_code.toLowerCase()}.png` : '')} 
                                            alt={team.team_name} 
                                            onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
                                          />
                                        </div>
                                        <span style={{ fontWeight: 700, color: 'var(--bg-dark)', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{getTranslatedName(team.team_name)}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontWeight: 900, fontSize: '1rem', color: 'var(--bg-dark)', whiteSpace: 'nowrap' }}>{team.points}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap' }}>{team.played}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.wins}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.draws}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.losses}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.goals_for}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.goals_against}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', color: team.goal_difference > 0 ? 'var(--green)' : team.goal_difference < 0 ? 'var(--red)' : 'inherit' }}>
                                      {team.goal_difference > 0 ? `+${team.goal_difference}` : team.goal_difference}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Real Table */}
                        <div style={{ flex: '1 1 500px' }}>
                          <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-gray)', marginBottom: '1rem', textTransform: 'uppercase', opacity: 0.7 }}>
                            <i className="ri- trophy-line"></i> Tabla Real (Oficial)
                          </h4>
                          <div className="table-responsive" style={{ borderRadius: '18px', overflowX: 'auto', border: '1px solid rgba(0,0,0,0.05)', WebkitOverflowScrolling: 'touch' }}>
                            <table className="forecast-table" style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse', opacity: 0.9 }}>
                              <thead>
                                <tr style={{ background: '#f1f3f5', borderBottom: '2px solid #ddd' }}>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Pos</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Equipo</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 900, whiteSpace: 'nowrap' }}>PTS</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>PJ</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>G</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>E</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>P</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>GF</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>GC</th>
                                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>DG</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(group.real_standings || []).map((team, idx) => (
                                  <tr key={`real-${team.team_id}`} style={{ borderBottom: '1px solid #f0f0f0', background: 'rgba(0,0,0,0.01)' }}>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'left', fontWeight: 800, color: idx < 2 ? 'var(--blue)' : 'var(--text-gray)', whiteSpace: 'nowrap' }}>
                                      {idx + 1}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.6rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div className="bm-flag" style={{ width: '28px', height: '28px', flexShrink: 0, opacity: 0.8 }}>
                                          <img 
                                            src={team.logo_url || (team.country_code ? `https://flagcdn.com/w80/${team.country_code.toLowerCase()}.png` : '')} 
                                            alt={team.team_name} 
                                            onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
                                          />
                                        </div>
                                        <span style={{ fontWeight: 600, color: 'var(--text-gray)', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{getTranslatedName(team.team_name)}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontWeight: 800, whiteSpace: 'nowrap' }}>{team.points}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.played}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.wins}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.draws}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.losses}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.goals_for}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{team.goals_against}</td>
                                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                      {team.goal_difference > 0 ? `+${team.goal_difference}` : team.goal_difference}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '1.2rem', background: 'rgba(212, 175, 55, 0.05)', fontSize: '0.85rem', color: 'var(--text-gray)', textAlign: 'center', fontWeight: 600 }}>
                        <i className="ri-information-line" style={{ color: 'var(--gold)' }}></i> Los 2 primeros clasificados avanzan a la fase eliminatoria
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
