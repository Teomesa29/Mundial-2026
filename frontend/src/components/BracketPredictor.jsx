import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { getTranslatedName } from '../utils/translations';

const BRACKET_STRUCTURE = {
  round_of_32: Array.from({ length: 16 }, (_, i) => ({ id: i + 1, nextMatchId: Math.floor(i / 2) + 17, isHome: i % 2 === 0 })),
  round_of_16: Array.from({ length: 8 }, (_, i) => ({ id: i + 17, nextMatchId: Math.floor(i / 2) + 25, isHome: i % 2 === 0 })),
  quarterfinal: Array.from({ length: 4 }, (_, i) => ({ id: i + 25, nextMatchId: Math.floor(i / 2) + 29, isHome: i % 2 === 0 })),
  semifinal: Array.from({ length: 2 }, (_, i) => ({ id: i + 29, nextMatchId: 31, isHome: i % 2 === 0 })),
  final: [{ id: 31, nextMatchId: null, isHome: true }]
};

export default function BracketPredictor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [r32Matches, setR32Matches] = useState([]);
  const [bracketState, setBracketState] = useState({});
  const [config, setConfig] = useState(null);
  const [bracketReady, setBracketReady] = useState({ is_ready: false });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch all matches to see if R32 is ready
        const matchesData = await api.get('/matches/');
        const r32 = matchesData.filter(m => m.stage === 'round_of_32');
        setR32Matches(r32);

        // Fetch bracket status
        try {
          const status = await api.get('/matches/bracket-status');
          setBracketReady(status);
        } catch (e) {
          console.error("Error fetching bracket status:", e);
        }

        // Fetch public config
        const configData = await api.get('/matches/config');
        setConfig(configData);

        // Fetch user's existing bracket
        try {
          const bracketData = await api.get('/predictions/bracket');
          let newState = {};
          if (bracketData && bracketData.bracket_data) {
            newState = bracketData.bracket_data;
          }

          // Merge or initialize with real R32 matches
          // We sort them by match_number and map them to IDs 1-16
          const sortedR32 = [...r32].sort((a, b) => a.match_number - b.match_number);
          
          sortedR32.forEach((m, index) => {
            const bracketId = index + 1;
            if (!newState[bracketId]) {
              newState[bracketId] = {
                home: m.home_team,
                away: m.away_team,
                winner: m.winner_team_id === m.home_team_id ? m.home_team : (m.winner_team_id === m.away_team_id ? m.away_team : null)
              };
            } else {
              // Ensure we have the latest real teams if they were TBD before
              newState[bracketId].home = m.home_team;
              newState[bracketId].away = m.away_team;
            }
          });
          setBracketState(newState);

        } catch (e) {
          console.log("Error initializing bracket state:", e.message);
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('No se pudieron cargar los datos.');
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

  // Initialize base matches in bracketState if they don't exist
  useEffect(() => {
    if (r32Matches.length > 0 && Object.keys(bracketState).length === 0) {
      const initialState = {};
      r32Matches.forEach((m, idx) => {
        initialState[idx + 1] = {
          home: m.home_team,
          away: m.away_team,
          winner: null
        };
      });
      setBracketState(initialState);
    }
  }, [r32Matches, bracketState]);

  const handlePickWinner = (matchId, team, nextMatchId, isHome) => {
    if (isLocked || !team) return;

    setBracketState(prev => {
      const newState = { ...prev };
      
      // Set winner for current match
      newState[matchId] = { ...newState[matchId], winner: team };

      if (nextMatchId) {
        if (!newState[nextMatchId]) {
          newState[nextMatchId] = { home: null, away: null, winner: null };
        }
        
        const nextMatch = { ...newState[nextMatchId] };
        
        // If the team advancing was already the winner of the next match (due to changing previous picks)
        // we need to clear downstream picks
        if (isHome) {
          nextMatch.home = team;
          if (nextMatch.winner && nextMatch.winner.id !== team.id) {
             clearDownstream(newState, nextMatchId);
             nextMatch.winner = null;
          }
        } else {
          nextMatch.away = team;
          if (nextMatch.winner && nextMatch.winner.id !== team.id) {
             clearDownstream(newState, nextMatchId);
             nextMatch.winner = null;
          }
        }
        newState[nextMatchId] = nextMatch;
      }
      return newState;
    });
  };

  const clearDownstream = (stateObj, startMatchId) => {
    let currentMatchId = startMatchId;
    while (currentMatchId) {
      stateObj[currentMatchId].winner = null;
      // find next
      let foundNext = null;
      for (const stage in BRACKET_STRUCTURE) {
        const matchDef = BRACKET_STRUCTURE[stage].find(m => m.id === currentMatchId);
        if (matchDef) {
          foundNext = matchDef.nextMatchId;
          break;
        }
      }
      currentMatchId = foundNext;
      if (currentMatchId && stateObj[currentMatchId]) {
         stateObj[currentMatchId].winner = null;
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/predictions/bracket', { bracket_data: bracketState });
      setSuccess('¡Llaves guardadas exitosamente!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Error al guardar las llaves.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-state">Cargando llaves...</div>;

  if (config && !config.is_bracket_open) {
    return (
      <div className="container" style={{padding: '2rem'}}>
        <div className="admin-card" style={{textAlign: 'center', padding: '5rem 2rem'}}>
          <div style={{
            width: '80px',
            height: '80px',
            background: 'rgba(212, 175, 55, 0.1)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 2rem',
            color: 'var(--gold)'
          }}>
            <i className="ri-lock-2-fill" style={{fontSize: '2.5rem'}}></i>
          </div>
          <h2 style={{fontFamily: 'var(--font-display)', fontSize: '2rem', marginBottom: '1rem'}}>Fase Final Próximamente</h2>
          <p style={{color: 'var(--text-gray)', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto'}}>
            Las predicciones para la fase de eliminación directa se habilitarán una vez finalizada la fase de grupos. 
            ¡Mantente atento para armar tu camino a la final!
          </p>
        </div>
      </div>
    );
  }

  if (!bracketReady.is_ready && r32Matches.length < 16) {
    return (
      <div className="view">
        <h1 className="display-text" style={{fontSize: '3rem', marginBottom: '1rem'}}>Fase Final (Llaves)</h1>
        <div className="empty-state" style={{padding: '3rem', textAlign: 'center'}}>
          <i className="ri-lock-fill" style={{fontSize: '3rem', color: 'var(--gold)', marginBottom: '1rem'}}></i>
          <h2>Las llaves aún no están disponibles</h2>
          <p style={{color: 'var(--text-gray)'}}>
            Las predicciones para la fase de eliminación directa se abrirán una vez finalice la fase de grupos y se conozcan los 32 equipos clasificados.
          </p>
          <div style={{marginTop: '2rem', fontSize: '0.9rem', color: 'var(--text-gray)'}}>
            Progreso fase de grupos: {bracketReady.finished_group_matches} / {bracketReady.total_group_matches} partidos finalizados
          </div>
        </div>
      </div>
    );
  }


  const getFlagUrl = (team) => {
    if (!team) return 'https://flagcdn.com/w80/un.png';
    return team.logo_url || (team.country_code ? `https://flagcdn.com/w80/${team.country_code.toLowerCase()}.png` : 'https://flagcdn.com/w80/un.png');
  };

  const renderMatch = (matchDef) => {
    const matchData = bracketState[matchDef.id] || { home: null, away: null, winner: null };
    const homeTeam = matchData.home;
    const awayTeam = matchData.away;
    const winner = matchData.winner;

    return (
      <div className="bracket-match-card interactive" key={matchDef.id}>
        <div 
          className={`bm-team clickable ${winner?.id === homeTeam?.id ? 'winner' : ''}`}
          onClick={() => handlePickWinner(matchDef.id, homeTeam, matchDef.nextMatchId, matchDef.isHome)}
        >
          <div className="bm-flag">
            <img src={getFlagUrl(homeTeam)} alt={homeTeam?.name || 'TBD'} />
          </div>
          <span className="bm-name">{homeTeam ? getTranslatedName(homeTeam.name) : 'TBD'}</span>
        </div>
        <div 
          className={`bm-team clickable ${winner?.id === awayTeam?.id ? 'winner' : ''}`}
          onClick={() => handlePickWinner(matchDef.id, awayTeam, matchDef.nextMatchId, matchDef.isHome)}
        >
          <div className="bm-flag">
            <img src={getFlagUrl(awayTeam)} alt={awayTeam?.name || 'TBD'} />
          </div>
          <span className="bm-name">{awayTeam ? getTranslatedName(awayTeam.name) : 'TBD'}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="view bracket-predictor-view">
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
            <div style={{ fontSize: '1.1rem' }}>El periodo de predicciones para las llaves ha finalizado</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Ya no es posible modificar tus llaves. Contacta al administrador si crees que es un error.</div>
          </div>
        </div>
      )}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <h1 className="display-text" style={{fontSize: '3rem'}}>Predicciones: Fase Final</h1>
        <button 
          className="btn btn-primary" 
          onClick={handleSave} 
          disabled={saving}
          style={{padding: '0.8rem 2rem', fontSize: '1.2rem', fontWeight: 'bold'}}
        >
          {saving ? 'Guardando...' : 'Guardar Llaves'}
        </button>
      </div>

      {error && <div className="toast toast-error">{error}</div>}
      {success && <div className="toast toast-success">{success}</div>}

      <div className="knockout-tree-container interactive-tree">
        <div className="bracket-side left">
          {['round_of_32', 'round_of_16', 'quarterfinal', 'semifinal'].map(stage => {
            const matches = BRACKET_STRUCTURE[stage];
            const half = matches.slice(0, matches.length / 2);
            return (
              <div key={`left-${stage}`} className={`bracket-column stage-${stage}`}>
                <div className="matches-column">
                  {half.map(renderMatch)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bracket-center">
          <div className="final-stage">
            <h3 className="column-label" style={{textAlign: 'center', color: 'var(--gold)', marginBottom: '1rem'}}>GRAN FINAL</h3>
            <div className="trophy-display" style={{textAlign: 'center', marginBottom: '1rem'}}>
              <i className="ri-trophy-fill" style={{fontSize: '4rem', color: 'var(--gold)', filter: 'drop-shadow(0 0 10px rgba(201, 168, 76, 0.5))'}}></i>
            </div>
            {renderMatch(BRACKET_STRUCTURE.final[0])}
            
            {/* Show Champion if final winner is picked */}
            {bracketState[31]?.winner && (
              <div className="champion-display pulse" style={{marginTop: '2rem', textAlign: 'center'}}>
                <h2 style={{color: 'var(--gold)', marginBottom: '1rem'}}>¡CAMPEÓN!</h2>
                <div className="champion-card" style={{background: 'rgba(201, 168, 76, 0.1)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--gold)'}}>
                  <img 
                    src={getFlagUrl(bracketState[31].winner)} 
                    style={{width: '80px', borderRadius: '5px', marginBottom: '1rem'}} 
                    alt="champion"
                  />
                  <h3>{getTranslatedName(bracketState[31].winner.name)}</h3>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bracket-side right">
          {['round_of_32', 'round_of_16', 'quarterfinal', 'semifinal'].reverse().map(stage => {
            const matches = BRACKET_STRUCTURE[stage];
            const half = matches.slice(matches.length / 2);
            return (
              <div key={`right-${stage}`} className={`bracket-column stage-${stage}`}>
                <div className="matches-column">
                  {half.map(renderMatch)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
