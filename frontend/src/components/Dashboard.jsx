import { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';
import { getTranslatedName } from '../utils/translations';
import LoadingScreen from './LoadingScreen';

export default function Dashboard({ navigateTo }) {
  const tiltRefs = useRef([]);
  const [topLeaders, setTopLeaders] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [userSummary, setUserSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [leaders, live, upcoming, me, myPreds] = await Promise.all([
          api.get('/leaderboard/top/3'),
          api.get('/matches/live'),
          api.get('/matches/upcoming'),
          api.get('/users/me'),
          api.get('/predictions/my')
        ]);
        setTopLeaders(leaders);
        setLiveMatches(live);
        setUpcomingMatches(upcoming);

        // Calculate user summary
        const totalMatches = live.length + upcoming.length + (myPreds?.length || 0); // Simplified
        const completedPreds = myPreds?.length || 0;
        setUserSummary({
          points: me.total_points || 0,
          predictionsCount: completedPreds,
          rank: 'Participante' // Could be dynamic
        });
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Poll for live matches every 30 seconds
    const livePoll = setInterval(async () => {
      try {
        const live = await api.get('/matches/live');
        setLiveMatches(live);
      } catch (err) {
        console.error('Error polling live matches:', err);
      }
    }, 30000);

    // Countdown logic
    const targetDate = new Date('2026-06-11T19:00:00Z');
    const timer = setInterval(() => {
      const now = new Date();
      const difference = targetDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60)
        });
      } else {
        clearInterval(timer);
      }
    }, 1000);

    const handleMouseMove = (e) => {
      tiltRefs.current.forEach(card => {
        if (!card) return;
        const rect = card.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotateX = ((y - centerY) / centerY) * -5;
          const rotateY = ((x - centerX) / centerX) * 5;
          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
        } else {
          card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        }
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      clearInterval(timer);
      clearInterval(livePoll);
    };
  }, []);

  const addToRefs = (el) => {
    if (el && !tiltRefs.current.includes(el)) {
      tiltRefs.current.push(el);
    }
  };

  if (loading) return <LoadingScreen text="DASHBOARD..." />;

  return (
    <div className="view dashboard-view">
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-subtitle">Próxima parada: Norteamérica</div>
          <h1 className="hero-title">POLLA <span>MUNDIALISTA</span></h1>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => navigateTo('predictions')}>
              Ingresar Predicciones <i className="ri-arrow-right-line"></i>
            </button>
            <button className="btn-secondary" onClick={() => navigateTo('leaderboard')}>
              Ver Ranking
            </button>
          </div>
        </div>
        <div className="countdown glass-card">
          <div className="cd-box">
            <div className="cd-number">{timeLeft.days}</div>
            <div className="cd-label">DÍAS</div>
          </div>
          <div className="cd-box">
            <div className="cd-number">{timeLeft.hours}</div>
            <div className="cd-label">HRS</div>
          </div>
          <div className="cd-box">
            <div className="cd-number">{timeLeft.minutes}</div>
            <div className="cd-label">MIN</div>
          </div>
          <div className="cd-box">
            <div className="cd-number">{timeLeft.seconds}</div>
            <div className="cd-label">SEG</div>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <div className="main-widgets">

          <div className="summary-card glass-card tilt-card" ref={addToRefs}>
            <div className="summary-info">
              <h3 className="widget-title">Tu Resumen</h3>
              <div className="summary-stats-wrapper">
                <div className="summary-stat">
                  <div className="summary-stat-value">{userSummary?.points || 0}</div>
                  <div className="summary-stat-label">PUNTOS TOTALES</div>
                </div>
                <div className="summary-stat">
                  <div className="summary-stat-value">{userSummary?.predictionsCount || 0}</div>
                  <div className="summary-stat-label">PREDICCIONES</div>
                </div>
              </div>
            </div>
            <div className="summary-visual">
              <i className="ri-trophy-line"></i>
            </div>
          </div>

          <div className="podium-container">
            <h3 className="widget-title podium-title">Top Líderes</h3>
            {topLeaders.length > 0 ? (
              <div className="podium-flow">
                {/* Second Place */}
                {topLeaders[1] && (
                  <div className="podium-col second tilt-card" ref={addToRefs}>
                    <div className="podium-card">
                      <div className="p-avatar">{(topLeaders[1].display_name || '??').substring(0, 2).toUpperCase()}</div>
                      <div className="p-name">{topLeaders[1].display_name || 'Usuario'}</div>
                      <div className="p-pts">{topLeaders[1].total_points || 0} pts</div>
                    </div>
                    <div className="podium-base">2</div>
                  </div>
                )}
                {/* First Place */}
                {topLeaders[0] && (
                  <div className="podium-col first tilt-card" ref={addToRefs}>
                    <div className="podium-card">
                      <div className="p-avatar">
                        {(topLeaders[0].display_name || '??').substring(0, 2).toUpperCase()}
                      </div>
                      <div className="p-name">{topLeaders[0].display_name || 'Usuario'}</div>
                      <div className="p-pts">{topLeaders[0].total_points || 0} pts</div>
                    </div>
                    <div className="podium-base">1</div>
                  </div>
                )}
                {/* Third Place */}
                {topLeaders[2] && (
                  <div className="podium-col third tilt-card" ref={addToRefs}>
                    <div className="podium-card">
                      <div className="p-avatar">{(topLeaders[2].display_name || '??').substring(0, 2).toUpperCase()}</div>
                      <div className="p-name">{topLeaders[2].display_name || 'Usuario'}</div>
                      <div className="p-pts">{topLeaders[2].total_points || 0} pts</div>
                    </div>
                    <div className="podium-base">3</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-gray)', paddingTop: '4rem' }}>
                Esperando resultados...
              </div>
            )}
          </div>
        </div>

        <div className="side-widgets">
          <div className="widget glass-card dashboard-widget">
            <div className="widget-header">
              <h3 className="widget-title">Próximos Partidos</h3>
              {upcomingMatches.some(m => {
                const matchDate = new Date(m.match_date);
                const today = new Date();
                return matchDate.getDate() === today.getDate() &&
                  matchDate.getMonth() === today.getMonth() &&
                  matchDate.getFullYear() === today.getFullYear();
              }) && <span className="badge-urgency">¡Juega Hoy!</span>}
            </div>
            {upcomingMatches.length > 0 ? upcomingMatches.slice(0, 3).map(m => (
              <div key={m.id} className="match-card-mini mc-dashboard tilt-card" ref={addToRefs} onClick={() => navigateTo('predictions')}>
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <img src={m.home_team?.logo_url || `https://flagcdn.com/w40/${m.home_team?.country_code?.toLowerCase()}.png`} className="team-flag-mini" alt="" />
                    <div className="mc-team">{getTranslatedName(m.home_team?.name)}</div>
                  </div>
                  <div className="mc-time">
                    <span className="mc-time-span">{(() => {
                      const d = new Date(m.match_date || m.utc_date);
                      return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    })()}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, justifyContent: 'flex-end' }}>
                    <div className="mc-team">{getTranslatedName(m.away_team?.name)}</div>
                    <img src={m.away_team?.logo_url || `https://flagcdn.com/w40/${m.away_team?.country_code?.toLowerCase()}.png`} className="team-flag-mini" alt="" />
                  </div>
                </div>
                <div className="mc-date">
                  {new Date(m.match_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })}
                </div>
              </div>
            )) : (
              <div className="match-card-mini mc-dashboard" style={{ background: 'rgba(0,0,0,0.05)', justifyContent: 'center', color: 'var(--text-gray)' }}>
                No hay partidos hoy
              </div>
            )}
          </div>

          <div className="widget glass-card dashboard-widget">
            <div className="widget-header">
              <h3 className="widget-title">En Vivo</h3>
            </div>
            {liveMatches.length > 0 ? liveMatches.map(m => (
              <div key={m.id} className="match-card-mini mc-dashboard mc-live tilt-card" ref={addToRefs}>
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <img src={m.home_team?.logo_url || `https://flagcdn.com/w40/${m.home_team?.country_code?.toLowerCase()}.png`} className="team-flag-mini" alt="" />
                    <div className="mc-team">{getTranslatedName(m.home_team?.name)}</div>
                  </div>
                  <div className="mc-score">{m.home_score} - {m.away_score}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, justifyContent: 'flex-end' }}>
                    <div className="mc-team">{getTranslatedName(m.away_team?.name)}</div>
                    <img src={m.away_team?.logo_url || `https://flagcdn.com/w40/${m.away_team?.country_code?.toLowerCase()}.png`} className="team-flag-mini" alt="" />
                  </div>
                </div>
                <div style={{ position: 'absolute', top: '5px', right: '5px' }}><span className="live-dot"></span></div>
              </div>
            )) : (
              <div className="match-card-mini mc-dashboard" style={{ background: 'rgba(0,0,0,0.05)', justifyContent: 'center', color: 'var(--text-gray)' }}>
                No hay partidos en vivo
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

