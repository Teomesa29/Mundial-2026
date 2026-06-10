import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { getTranslatedName } from '../utils/translations';
import LoadingScreen from './LoadingScreen';

export default function Specials() {
  const [categories, setCategories] = useState([]);
  const [answers, setAnswers] = useState({});
  const [teams, setTeams] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [localValues, setLocalValues] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catsData, myAnswers, teamsData, configData] = await Promise.all([
          api.get('/special-bets/categories'),
          api.get('/special-bets/my'),
          api.get('/teams/'),
          api.get('/matches/config')
        ]);

        setConfig(configData);

        const orderMap = { 'Campeón': 1, 'Subcampeón': 2, 'Segundo Lugar': 2, 'Tercer Lugar': 3, 'Goleador': 4, 'Mejor portero del torneo': 5 };
        const sortedCats = catsData.sort((a, b) => {
          const orderA = orderMap[a.name] || 99;
          const orderB = orderMap[b.name] || 99;
          if (orderA !== orderB) return orderA - orderB;
          return b.points_reward - a.points_reward;
        });
        setCategories(sortedCats);
        
        const sortedTeams = teamsData
          .map(t => ({ ...t, translatedName: getTranslatedName(t.name) }))
          .sort((a, b) => a.translatedName.localeCompare(b.translatedName));
        setTeams(sortedTeams);

        const ansObj = {};
        myAnswers.forEach(a => {
          ansObj[a.category_id] = a;
        });
        setAnswers(ansObj);
      } catch (err) {
        console.error('Error fetching specials:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleLocalChange = (catId, value) => {
    setLocalValues(prev => ({ ...prev, [catId]: value }));
  };

  const handleSave = async (categoryId, type) => {
    const value = localValues[categoryId];
    if (value === undefined || value === '') return;

    setSavingId(categoryId);
    const payload = { category_id: categoryId };
    if (type === 'team') payload.answer_team_id = parseInt(value);
    else if (type === 'text') payload.answer_text = value;

    try {
      const response = await api.post('/special-bets/', payload);
      setAnswers(prev => ({ ...prev, [categoryId]: response }));
      setLocalValues(prev => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
    } catch (err) {
      console.error('Error saving special bet:', err);
      const msg = err.response?.data?.detail || err.message || 'Error al guardar';
      alert(msg);
    } finally {
      setSavingId(null);
    }
  };

  const getIcon = (name) => {
    const n = name.toLowerCase();
    if (n.includes('campeón')) return 'ri-trophy-fill';
    if (n.includes('subcampeón') || n.includes('segundo')) return 'ri-medal-fill';
    if (n.includes('tercer')) return 'ri-medal-line';
    if (n.includes('jugador')) return 'ri-user-star-fill';
    if (n.includes('goleador')) return 'ri-football-fill';
    if (n.includes('valla') || n.includes('portero')) return 'ri-shield-user-fill';
    return 'ri-star-fill';
  };

  const formatDeadline = (deadline) => {
    const d = new Date(deadline);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const isGlobalLocked = () => {
    if (!config) return false;
    if (!config.is_registration_open) return true;
    if (config.entry_deadline) {
      const deadline = new Date(config.entry_deadline);
      if (new Date() > deadline) return true;
    }
    return false;
  };

  const getGlobalDeadline = () => {
    if (!config || !config.entry_deadline) return null;
    return new Date(config.entry_deadline);
  };

  const renderCategoryCard = (cat, highlight = false) => {
    const savedAns = answers[cat.id];
    const globalDeadline = getGlobalDeadline();
    const catDeadline = new Date(cat.deadline);
    
    // The actual deadline is the global config entry deadline if set, otherwise fallback to category deadline
    const effectiveDeadline = globalDeadline || catDeadline;
    const hasPassed = new Date() > effectiveDeadline;
    const isLocked = isGlobalLocked() || hasPassed;

    const savedValue = cat.bet_type === 'team'
      ? (savedAns?.answer_team_id != null ? String(savedAns.answer_team_id) : '')
      : (savedAns?.answer_text ?? '');
    const currentValue = localValues[cat.id] !== undefined ? localValues[cat.id] : savedValue;

    // Changed = user has a localValue AND it's different from what's saved
    const isModified = localValues[cat.id] !== undefined && String(localValues[cat.id]) !== String(savedValue);
    // New = no saved answer yet and user has selected something
    const isNew = !savedAns && currentValue !== '';
    const canSave = !savingId && (isModified || isNew);

    return (
      <div key={cat.id} className={`special-card ${isLocked ? 'locked' : ''} tilt-card`} style={highlight ? { border: '2px solid var(--gold)', transform: 'scale(1.02)' } : {}}>
        <div className="sc-pts">{cat.points_reward} PTS</div>
        <div className="sc-icon">
          <i className={getIcon(cat.name)} style={highlight ? { color: 'var(--gold)' } : {}}></i>
        </div>
        <div className="sc-content" style={{ position: 'relative', zIndex: 1 }}>
          <h3 className="sc-title">{cat.name}</h3>
          <p className="sc-desc">{cat.description}</p>

          {cat.bet_type === 'team' ? (
            <select
              className={`custom-select ${isLocked ? 'locked-input' : ''}`}
              value={currentValue}
              onChange={(e) => handleLocalChange(cat.id, e.target.value)}
              disabled={isLocked}
            >
              <option value="" disabled>Selecciona un país...</option>
              {teams.map(t => (
                <option key={t.id} value={String(t.id)}>{t.translatedName}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className={`custom-input ${isLocked ? 'locked-input' : ''}`}
              placeholder="Escribe tu respuesta..."
              value={currentValue}
              onChange={(e) => handleLocalChange(cat.id, e.target.value)}
              disabled={isLocked}
            />
          )}

          {!isLocked ? (
            <>
              <button
                className="btn-primary"
                style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }}
                onClick={() => handleSave(cat.id, cat.bet_type)}
                disabled={!canSave}
              >
                {savingId === cat.id ? 'Guardando...' : (savedAns ? 'Actualizar' : 'Guardar')}
              </button>
              <div style={{marginTop: '0.75rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-gray)', opacity: 0.7}}>
                <i className="ri-time-line"></i> Cierra: {formatDeadline(effectiveDeadline)}
              </div>
            </>
          ) : (
            <div className="saved-badge">
              <i className="ri-lock-fill"></i> CERRADO
            </div>
          )}

          {savedAns && !isLocked && !isModified && (
            <div style={{marginTop: '0.5rem', color: 'var(--green)', fontWeight: 800, fontSize: '0.8rem', textAlign: 'center'}}>
              <i className="ri-checkbox-circle-fill"></i> PREDICCIÓN GUARDADA
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <LoadingScreen text="ESPECIALES..." />;

  const podiumCats = categories.filter(c => c.bet_type === 'team');
  const individualCats = categories.filter(c => c.bet_type === 'text');

  return (
    <div className="view">
      {isGlobalLocked() && (
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
            <div style={{ fontSize: '1.1rem' }}>El periodo de apuestas especiales ha finalizado</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Ya no es posible modificar tus apuestas especiales.</div>
          </div>
        </div>
      )}
      <h1 className="display-text" style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', marginBottom: '0.5rem' }}>Apuestas Especiales</h1>
      <p style={{ color: 'var(--text-gray)', fontWeight: 500, marginBottom: '2rem' }}>
        Predice los resultados finales del torneo.
        <span style={{ color: 'var(--gold)', marginLeft: '0.5rem' }}>
          {isGlobalLocked() ? 'El plazo ha vencido.' : `Plazo máximo: ${config?.entry_deadline ? formatDeadline(config.entry_deadline) : 'Cierre del torneo'}`}
        </span>
      </p>

      <div className="specials-layout" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
        <div className="specials-section">
          <h2 className="section-title" style={{ marginBottom: '1.5rem', borderBottom: '2px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Podio Final</h2>
          <div className="specials-grid">
            {podiumCats.map(cat => renderCategoryCard(cat, cat.name.toLowerCase().includes('campeón')))}
          </div>
        </div>

        <div className="specials-section">
          <h2 className="section-title" style={{ marginBottom: '1.5rem', borderBottom: '2px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Premios Individuales</h2>
          <div className="specials-grid">
            {individualCats.map(cat => renderCategoryCard(cat, false))}
          </div>
        </div>
      </div>
    </div>
  );
}
