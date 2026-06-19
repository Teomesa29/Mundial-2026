import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { getTranslatedName, getTranslatedStage } from '../utils/translations';
import LoadingScreen from './LoadingScreen';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const [userData, predsData] = await Promise.all([
          api.get('/users/me'),
          api.get('/predictions/my')
        ]);
        setUser(userData);
        setPredictions(predsData);
      } catch (err) {
        console.error('Error fetching profile data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfileData();
  }, []);

  if (loading) return <LoadingScreen text="MI PERFIL..." />;

  return (
    <div className="view" style={{animation: 'fadeIn 0.4s ease-out forwards'}}>
      <div className="profile-header tilt-card">
        <div className="profile-avatar" style={user?.avatar_url ? { overflow: 'hidden', padding: 0 } : {}}>
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            user?.display_name?.substring(0, 2).toUpperCase()
          )}
        </div>
        <div className="profile-main-info">
          <h1 className="profile-name">{user?.display_name}</h1>
          <p className="profile-email">{user?.email}</p>
          <div className="profile-stats-row">
            <div className="p-stat">
              <span className="p-stat-val">{user?.total_points}</span>
              <span className="p-stat-label">Puntos Totales</span>
            </div>
            <div className="p-stat">
              <span className="p-stat-val">{predictions.length}</span>
              <span className="p-stat-label">Predicciones</span>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-content">
        <h2 className="section-title">Mi Historial de Predicciones</h2>
        <div className="predictions-history">
          {predictions.length > 0 ? (
            predictions.map(pred => (
              <div key={pred.id} className={`history-card ${pred.points_earned > 0 ? 'correct' : pred.match?.status?.toLowerCase() === 'finished' ? 'incorrect' : 'pending'}`}>
                <div className="history-match-info">
                  <span className="match-stage">{getTranslatedStage(pred.match?.stage, pred.match?.group_name)}</span>
                  <div className="match-teams-row">
                    <span className="team-name">{getTranslatedName(pred.match?.home_team?.name)}</span>
                    <span className="vs">vs</span>
                    <span className="team-name">{getTranslatedName(pred.match?.away_team?.name)}</span>
                  </div>
                </div>
                
                <div className="history-prediction">
                  <div className="h-pred-block">
                    <span className="h-label">Tu Predicción</span>
                    <span className="h-val">{pred.predicted_home_score} - {pred.predicted_away_score}</span>
                  </div>
                  {pred.match?.status?.toLowerCase() === 'finished' && (
                    <div className="h-pred-block">
                      <span className="h-label">Resultado Real</span>
                      <span className="h-val">{pred.match?.home_score} - {pred.match?.away_score}</span>
                    </div>
                  )}
                </div>

                <div className="history-result">
                  {pred.match?.status?.toLowerCase() === 'finished' ? (
                    <div className="points-badge">
                      <span className="pts">{pred.points_earned > 0 ? `+${pred.points_earned}` : '-0'}</span>
                      <span className="pts-label">Puntos</span>
                      {pred.is_exact_score && <span className="exact-tag">MARCADOR EXACTO</span>}
                    </div>
                  ) : (
                    <div className="pending-badge">PENDIENTE</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">No has realizado ninguna predicción todavía.</div>
          )}
        </div>
      </div>
    </div>
  );
}
