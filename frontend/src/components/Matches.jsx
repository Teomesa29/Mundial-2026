import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import KnockoutBracket from './KnockoutBracket';
import { getTranslatedName, getTranslatedStage } from '../utils/translations';
import LoadingScreen from './LoadingScreen';

export default function Matches() {
  const [activeTab, setActiveTab] = useState('grupos');
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const data = await api.get('/matches/');
        setMatches(data);
      } catch (err) {
        console.error('Error fetching matches:', err);
        setError('No se pudo cargar la lista de partidos');
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, []);

  if (loading) {
    return <LoadingScreen text="PARTIDOS..." />;
  }

  const groupMatches = matches.filter(m => m.stage === 'group');
  const knockoutMatches = matches.filter(m => m.stage !== 'group');

  const filteredMatches = activeTab === 'grupos' ? groupMatches : knockoutMatches;

  // Helper to group by group name
  const matchesByGroup = groupMatches.reduce((acc, m) => {
    const group = getTranslatedStage(m.stage, m.group_name) || 'Sin Grupo';
    if (!acc[group]) acc[group] = [];
    acc[group].push(m);
    return acc;
  }, {});

  return (
    <div className="view">
      <h1 className="display-text" style={{fontSize: '4rem', marginBottom: '2rem'}}>Partidos</h1>
      
      <div className="filters">
        <button className={`filter-btn ${activeTab === 'grupos' ? 'active' : ''}`} onClick={() => setActiveTab('grupos')}>Fase de Grupos</button>
        <button className={`filter-btn ${activeTab === 'eliminatorias' ? 'active' : ''}`} onClick={() => setActiveTab('eliminatorias')}>Eliminatorias</button>
      </div>

      {loading ? (
        <div className="loading-state" style={{padding: '3rem', textAlign: 'center'}}>Cargando partidos...</div>
      ) : error ? (
        <div className="error-state" style={{padding: '3rem', textAlign: 'center', color: 'var(--red)'}}>{error}</div>
      ) : (
        <div className="matches-grid">
          {activeTab === 'grupos' ? (
            Object.keys(matchesByGroup).length === 0 ? (
              <div className="empty-state" style={{padding: '3rem', textAlign: 'center', color: 'var(--text-gray)'}}>No hay partidos de grupos programados.</div>
            ) : (
              Object.entries(matchesByGroup)
                .sort((a, b) => {
                  const priority = {
                    'Grupo A': 1, 'Grupo B': 2, 'Grupo C': 3, 'Grupo D': 4,
                    'Grupo E': 5, 'Grupo F': 6, 'Grupo G': 7, 'Grupo H': 8
                  };
                  return (priority[a[0]] || 99) - (priority[b[0]] || 99);
                })
                .map(([groupName, groupMatches]) => (
                <div className="group-section" key={groupName}>
                  <h2 className="group-title">{groupName}</h2>
                  <div className="matches-list">
                    {groupMatches.map(m => (
                      <div key={m.id} className="match-card-modern tilt-card">
                        <div className="match-card-header">
                          <span className="match-date">
                            {(() => {
                              const d = new Date(m.match_date || m.utc_date);
                              return isNaN(d.getTime()) ? 'Fecha por definir' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                            })()}
                          </span>
                          {m.status === 'live' || m.status === 'IN_PLAY' || m.status === 'PAUSED' ? (
                            <span className="live-tag pulse">En vivo</span>
                          ) : (
                            <span className={`status-tag ${m.status}`}>
                              {m.status === 'scheduled' || m.status === 'TIMED' || m.status === 'SCHEDULED' ? 'Pendiente' : 
                               m.status === 'finished' || m.status === 'FINISHED' ? 'Finalizado' : m.status}
                            </span>
                          )}
                        </div>
                        
                        <div className="match-main">
                          <div className="m-team home">
                            <div className="bm-flag">
                              <img 
                                src={m.home_team?.logo_url || (m.home_team?.country_code ? `https://flagcdn.com/w80/${m.home_team.country_code.toLowerCase()}.png` : '')} 
                                alt={m.home_team?.name}
                                onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
                              />
                            </div>
                            <span className="team-name">{getTranslatedName(m.home_team?.name)}</span>
                          </div>
                          
                          <div className="m-score-area">
                            {m.status === 'scheduled' ? (
                              <span className="vs-label">VS</span>
                            ) : (
                              <div className="score-display">
                                <span>{m.home_score}</span>
                                <span className="score-sep">-</span>
                                <span>{m.away_score}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="m-team away">
                            <span className="team-name">{getTranslatedName(m.away_team?.name)}</span>
                            <div className="bm-flag">
                              <img 
                                src={m.away_team?.logo_url || (m.away_team?.country_code ? `https://flagcdn.com/w80/${m.away_team.country_code.toLowerCase()}.png` : '')} 
                                alt={m.away_team?.name}
                                onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        <div className="match-card-footer">
                          <span>Sede: {m.stadium?.name || 'Por definir'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )
          ) : (
            knockoutMatches.length === 0 ? (
              <div className="empty-state" style={{padding: '3rem', textAlign: 'center', color: 'var(--text-gray)'}}>Las eliminatorias aún no han comenzado.</div>
            ) : (
              <KnockoutBracket matches={knockoutMatches} />
            )
          )}
        </div>
      )}
    </div>
  );
}

