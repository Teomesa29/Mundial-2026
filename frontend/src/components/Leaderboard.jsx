import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import LoadingScreen from './LoadingScreen';

export default function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      <h1 className="display-text" style={{ fontSize: '4rem', marginBottom: '2rem' }}>Ranking Global</h1>

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
                  <th>Exactos</th>
                  <th>Puntos</th>
                </tr>
              </thead>
              <tbody>
                {leaders.length > 0 ? (
                  leaders.map((entry) => (
                    <tr key={entry.user_id}>
                      <td className="rank">{entry.position}</td>
                      <td>
                        <div className="user-cell">
                          <div className="u-avatar" style={entry.position === 1 ? { background: 'var(--gold)', color: 'var(--bg-dark)' } : {}}>
                            {entry.user.display_name?.substring(0, 2).toUpperCase() || '??'}
                          </div>
                          {entry.user.display_name}
                        </div>
                      </td>
                      <td>
                        <div className="streak">
                          {entry.streak && entry.streak.length > 0 ? (
                            entry.streak.map((s, i) => (
                              <div 
                                key={i} 
                                className={`dot streak-${s.toLowerCase()}`} 
                                title={s === 'E' ? 'Exacto (+5 pts)' : s === 'W' ? 'Acierto (+3 pts)' : 'Fallo (0 pts)'}
                              ></div>
                            ))
                          ) : (
                            <span style={{color: 'var(--text-gray)', fontSize: '0.8rem'}}>Sin predicciones</span>
                          )}
                        </div>
                      </td>
                      <td>{entry.exact_count || 0}</td>
                      <td className="pts-cell">{entry.total_points}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No hay datos disponibles</td>
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
    </div>
  );
}

