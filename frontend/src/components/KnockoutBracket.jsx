import copaLogo from '../assets/copa.png';

const KnockoutBracket = ({ matches }) => {
  // Stages definition
  const stages = [
    { id: 'round_of_32', label: '16vos' },
    { id: 'round_of_16', label: 'Octavos' },
    { id: 'quarterfinal', label: 'Cuartos' },
    { id: 'semifinal', label: 'Semifinal' },
    { id: 'final', label: 'Final' }
  ];

  // Helper to get flag URL
  const getFlagUrl = (team) => {
    if (!team) return 'https://flagcdn.com/w80/un.png';
    return team.logo_url || (team.country_code ? `https://flagcdn.com/w80/${team.country_code.toLowerCase()}.png` : 'https://flagcdn.com/w80/un.png');
  };

  // Group matches by stage
  const grouped = matches.reduce((acc, m) => {
    if (!acc[m.stage]) acc[m.stage] = [];
    acc[m.stage].push(m);
    return acc;
  }, {});

  // For a symmetrical bracket, we need to split matches into left and right sides
  // This assumes the order of matches in the array follows the bracket structure
  const splitBracket = (stageMatches) => {
    if (!stageMatches) return [[], []];
    const half = Math.ceil(stageMatches.length / 2);
    return [stageMatches.slice(0, half), stageMatches.slice(half)];
  };

  const renderMatch = (match, isRightSide = false) => {
    const isFinished = match && match.status === 'finished';
    const homeWinner = isFinished && (match.home_score > match.away_score || match.home_score_penalties > match.away_score_penalties);
    const awayWinner = isFinished && (match.away_score > match.home_score || match.away_score_penalties > match.home_score_penalties);
    const homeTeam = match?.home_team;
    const awayTeam = match?.away_team;
    const homeScore = match?.home_score;
    const awayScore = match?.away_score;

    const renderTeamRow = (team, score, isWinner, isHome) => {
      if (isRightSide) {
        return (
          <div className={`bm-team ${isWinner ? 'winner' : ''}`} style={{ padding: '0.6rem 0.8rem', display: 'flex', alignItems: 'center', minHeight: '44px', borderTop: !isHome ? '1px solid #f0f0f0' : 'none' }}>
            <span className="bm-score" style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--bg-dark)', marginRight: 'auto' }}>
              {score ?? '-'}
            </span>
            <span className="bm-name" style={{ fontSize: '0.88rem', fontWeight: 700, color: team ? '#111' : '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'right', marginRight: '0.8rem' }}>
              {team ? team.name : 'TBD'}
            </span>
            <div className="bm-flag" style={{ width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(0,0,0,0.08)' }}>
              <img 
                src={getFlagUrl(team)} 
                alt={team?.name || 'TBD'} 
                onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
              />
            </div>
          </div>
        );
      } else {
        return (
          <div className={`bm-team ${isWinner ? 'winner' : ''}`} style={{ padding: '0.6rem 0.8rem', display: 'flex', alignItems: 'center', minHeight: '44px', borderTop: !isHome ? '1px solid #f0f0f0' : 'none' }}>
            <div className="bm-flag" style={{ width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, marginRight: '0.8rem', border: '1px solid rgba(0,0,0,0.08)' }}>
              <img 
                src={getFlagUrl(team)} 
                alt={team?.name || 'TBD'} 
                onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
              />
            </div>
            <span className="bm-name" style={{ fontSize: '0.88rem', fontWeight: 700, color: team ? '#111' : '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
              {team ? team.name : 'TBD'}
            </span>
            <span className="bm-score" style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--bg-dark)', marginLeft: 'auto' }}>
              {score ?? '-'}
            </span>
          </div>
        );
      }
    };

    if (!match) {
      return (
        <div className="bracket-match-card placeholder-card" style={{ opacity: 0.4, border: '1px dashed rgba(0,0,0,0.15)', background: 'rgba(220, 220, 220, 0.2)', display: 'flex', flexDirection: 'column' }}>
          {renderTeamRow(null, null, false, true)}
          {renderTeamRow(null, null, false, false)}
        </div>
      );
    }

    return (
      <div className={`bracket-match-card ${match.status}`} key={match.id} style={{ display: 'flex', flexDirection: 'column' }}>
        {renderTeamRow(homeTeam, homeScore, homeWinner, true)}
        {renderTeamRow(awayTeam, awayScore, awayWinner, false)}
      </div>
    );
  };

  // Special rendering for Final
  const finalMatch = grouped['final']?.[0];

  return (
    <div className="bracket-scroll-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '1.5rem' }}>
      {/* Scroll Hint */}
      <div className="mobile-scroll-hint" style={{ display: 'none', textAlign: 'center', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', padding: '0.8rem 1rem', borderRadius: '10px', color: 'var(--gold-dark)', fontSize: '0.9rem', marginBottom: '1.5rem', fontWeight: 700 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', animation: 'pulse 1.5s infinite' }}>
          <i className="ri-arrow-left-right-line"></i> Desliza horizontalmente para ver el árbol completo
        </span>
      </div>

      <style>{`
        .matches-view {
          max-width: 100%;
          overflow-x: hidden !important;
        }
        .bracket-scroll-wrapper {
          width: 100%;
          max-width: 100%;
          overflow-x: auto !important;
        }
        .knockout-tree-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2rem !important;
          padding: 2rem 0 !important;
          min-width: 1950px !important;
          margin: 0 auto;
          overflow-x: visible !important;
        }
        .bracket-side {
          display: flex;
          gap: 2rem !important;
          flex: 1;
        }
        .bracket-side.right {
          flex-direction: row !important;
        }
        .bracket-match-card {
          width: 200px !important;
          border-radius: 14px !important;
          margin-bottom: 0.8rem !important;
          background: rgba(255, 255, 255, 0.95);
          overflow: visible !important;
        }
        .bracket-match-card .bm-team:first-child {
          border-top-left-radius: 14px !important;
          border-top-right-radius: 14px !important;
        }
        .bracket-match-card .bm-team:last-child {
          border-bottom-left-radius: 14px !important;
          border-bottom-right-radius: 14px !important;
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
      `}</style>

      <div className="knockout-tree-container">
        <div className="bracket-side left">
          {stages.slice(0, 4).map(stage => {
            const sideMatches = splitBracket(grouped[stage.id])[0];
            return (
              <div key={`left-${stage.id}`} className={`bracket-column stage-${stage.id}`}>
                <h3 className="column-label" style={{ color: 'var(--gold)', textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.5rem', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>{stage.label}</h3>
                <div className="matches-column">
                  {sideMatches.map(m => renderMatch(m, false))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bracket-center">
          <div className="final-stage" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', position: 'relative' }}>
            <h3 className="column-label" style={{ textAlign: 'center', color: 'var(--gold)', marginBottom: '1.5rem', fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', textShadow: '0 0 10px rgba(201,168,76,0.3)' }}>FINAL</h3>
            
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

            {renderMatch(finalMatch, false)}
            
            {grouped['third_place']?.[0] && (
              <div className="third-place-box">
                <h4>Tercer Puesto</h4>
                {renderMatch(grouped['third_place'][0], false)}
              </div>
            )}
          </div>
        </div>

        <div className="bracket-side right" style={{ flexDirection: 'row' }}>
          {stages.slice(0, 4).reverse().map(stage => {
            const sideMatches = splitBracket(grouped[stage.id])[1];
            return (
              <div key={`right-${stage.id}`} className={`bracket-column stage-${stage.id}`}>
                <h3 className="column-label" style={{ color: 'var(--gold)', textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.5rem', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>{stage.label}</h3>
                <div className="matches-column">
                  {sideMatches.map(m => renderMatch(m, true))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KnockoutBracket;
