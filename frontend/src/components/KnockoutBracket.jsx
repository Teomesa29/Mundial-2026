import React from 'react';

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

  const renderMatch = (match) => {
    if (!match) return <div className="bracket-match placeholder">TBD</div>;
    
    const isFinished = match.status === 'finished';
    const homeWinner = isFinished && (match.home_score > match.away_score || match.home_score_penalties > match.away_score_penalties);
    const awayWinner = isFinished && (match.away_score > match.home_score || match.away_score_penalties > match.home_score_penalties);

    return (
      <div className={`bracket-match-card ${match.status}`} key={match.id}>
        <div className={`bm-team ${homeWinner ? 'winner' : ''}`}>
          <div className="bm-flag">
            <img 
              src={getFlagUrl(match.home_team)} 
              alt={match.home_team?.name || 'TBD'} 
              onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
            />
          </div>
          <span className="bm-name">{match.home_team?.name || 'TBD'}</span>
          <span className="bm-score">{match.home_score ?? '-'}</span>
        </div>
        <div className={`bm-team ${awayWinner ? 'winner' : ''}`}>
          <div className="bm-flag">
            <img 
              src={getFlagUrl(match.away_team)} 
              alt={match.away_team?.name || 'TBD'} 
              onError={(e) => { e.target.src = 'https://flagcdn.com/w80/un.png'; }}
            />
          </div>
          <span className="bm-name">{match.away_team?.name || 'TBD'}</span>
          <span className="bm-score">{match.away_score ?? '-'}</span>
        </div>
      </div>
    );
  };

  // Special rendering for Final
  const finalMatch = grouped['final']?.[0];

  return (
    <div className="knockout-tree-container">
      <div className="bracket-side left">
        {stages.slice(0, 4).map(stage => {
          const sideMatches = splitBracket(grouped[stage.id])[0];
          return (
            <div key={`left-${stage.id}`} className={`bracket-column stage-${stage.id}`}>
              <h3 className="column-label">{stage.label}</h3>
              <div className="matches-column">
                {sideMatches.map(m => renderMatch(m))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bracket-center">
        <div className="final-stage">
          <h3 className="column-label">FINAL</h3>
          <div className="trophy-display">
            <i className="ri-trophy-fill"></i>
          </div>
          {renderMatch(finalMatch)}
          
          {grouped['third_place']?.[0] && (
            <div className="third-place-box">
              <h4>Tercer Puesto</h4>
              {renderMatch(grouped['third_place'][0])}
            </div>
          )}
        </div>
      </div>

      <div className="bracket-side right">
        {stages.slice(0, 4).reverse().map(stage => {
          const sideMatches = splitBracket(grouped[stage.id])[1];
          return (
            <div key={`right-${stage.id}`} className={`bracket-column stage-${stage.id}`}>
              <h3 className="column-label">{stage.label}</h3>
              <div className="matches-column">
                {sideMatches.map(m => renderMatch(m))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KnockoutBracket;
