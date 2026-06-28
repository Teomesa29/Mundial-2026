import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { getTranslatedName } from '../utils/translations';
import LoadingScreen from './LoadingScreen';
import BracketPredictor from './BracketPredictor';

let notificationCounter = 0;
let tempUserCounter = 0;

const toLocalISOString = (dateOrStr) => {
  if (!dateOrStr) return '';
  const date = new Date(dateOrStr);
  if (isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

export default function AdminPanel() {
  const [stats, setStats] = useState({ total_users: 0, total_predictions: 0, matches_pending_update: 0 });
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [viewingUserBracket, setViewingUserBracket] = useState(null);
  
  // Forms
  const [newUserData, setNewUserData] = useState({ display_name: '', email: '', password: '', role: 'participant' });
  const [matchUpdate, setMatchUpdate] = useState({ home_score: 0, away_score: 0, status: 'finished' });

  // Statuses
  const [isSyncing, setIsSyncing] = useState(false);
  const [config, setConfig] = useState(null);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [specialBets, setSpecialBets] = useState([]);
  const [resolvingSpecial, setResolvingSpecial] = useState(null);
  const [specialAnswer, setSpecialAnswer] = useState('');
  const [editingDeadline, setEditingDeadline] = useState({}); // { [catId]: 'datetime-local string' }
  const [savingDeadline, setSavingDeadline] = useState(null);

  const fetchSpecialBets = async () => {
    try {
      const data = await api.get('/admin/special-bets/pending');
      setSpecialBets(data);
    } catch (err) {
      console.error('Error fetching special bets:', err);
    }
  };

  const handleResolveSpecial = async (e) => {
    if (e) e.preventDefault();
    if (!specialAnswer) return;
    try {
      await api.post(`/admin/special-bets/${resolvingSpecial.id}/resolve`, { answer: specialAnswer });
      addNotification('Éxito', 'Apuesta especial resuelta y puntos distribuidos');
      setResolvingSpecial(null);
      setSpecialAnswer('');
      fetchSpecialBets();
    } catch (err) {
      console.error(err);
      addNotification('Error', 'No se pudo resolver la apuesta', 'error');
    }
  };

  const handleUpdateDeadline = async (catId) => {
    const rawVal = editingDeadline[catId];
    if (!rawVal) return;
    setSavingDeadline(catId);
    try {
      // Convert local datetime-local string to UTC ISO string
      const utcIso = new Date(rawVal).toISOString();
      await api.patch(`/admin/special-bets/${catId}/deadline`, { deadline: utcIso });
      addNotification('Éxito', 'Fecha límite actualizada correctamente');
      // Update local state
      setSpecialBets(prev => prev.map(b => b.id === catId ? { ...b, deadline: utcIso } : b));
      setEditingDeadline(prev => { const n = {...prev}; delete n[catId]; return n; });
    } catch (err) {
      console.error(err);
      addNotification('Error', 'No se pudo actualizar la fecha', 'error');
    } finally {
      setSavingDeadline(null);
    }
  };

  const addNotification = (title, msg, type = 'success') => {
    const id = ++notificationCounter;
    setNotifications(prev => [...prev, { id, title, msg, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const fetchAdminData = async (bustCache = false) => {
    const opts = bustCache ? { cache: false } : { cache: true };
    try {
      const [statsData, matchesData, usersData, teamsData] = await Promise.all([
        api.get('/admin/dashboard', opts),
        api.get('/matches/',        opts),
        api.get('/admin/users',     opts),
        api.get('/teams/',          opts),
      ]);
      setStats(statsData);
      setMatches(matchesData);
      setUsers(usersData);
      setTeams(teamsData);
      fetchConfig();
    } catch (err) {
      console.error(err);
      addNotification('Error', 'No se pudieron cargar los datos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const configData = await api.get('/admin/config');
      setConfig(configData);
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchAdminData();
    if (activeTab === 'especiales') fetchSpecialBets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    setIsUpdatingConfig(true);
    try {
      const updated = await api.put('/admin/config', config);
      setConfig(updated);
      addNotification('Éxito', 'Configuración actualizada correctamente');
    } catch (err) {
      console.error(err);
      addNotification('Error', 'Error al actualizar la configuración', 'error');
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (newUserData.password.length < 4) {
      return addNotification('Validación', 'La contraseña debe tener al menos 4 caracteres', 'error');
    }

    // ── Optimistic UI: close modal and show user immediately ──
    const tempUser = {
      id: `temp-${++tempUserCounter}`,
      display_name: newUserData.display_name,
      email: newUserData.email,
      role: newUserData.role,
      is_active: true,
      total_points: 0,
    };
    setUsers(prev => [tempUser, ...prev]);
    setStats(prev => ({ ...prev, total_users: prev.total_users + 1 }));
    setShowCreateModal(false);
    addNotification('Éxito', `Usuario ${newUserData.display_name} creado`);
    const savedForm = { ...newUserData };
    setNewUserData({ display_name: '', email: '', password: '', role: 'participant' });

    try {
      const created = await api.post('/admin/users', savedForm);
      // Replace temp entry with real server data
      setUsers(prev => prev.map(u => u.id === tempUser.id ? created : u));
    } catch (err) {
      // Revert
      setUsers(prev => prev.filter(u => u.id !== tempUser.id));
      setStats(prev => ({ ...prev, total_users: prev.total_users - 1 }));
      addNotification('Error', err.message || 'Error al crear usuario', 'error');
    }
  };

  const [deletingUserId, setDeletingUserId] = useState(null);

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('¿Estás seguro de eliminar este usuario?')) return;

    setDeletingUserId(userId);
    try {
      await api.delete(`/admin/users/${userId}`);
      
      // ── Pessimistic removal (only after server confirms) ──
      setUsers(prev => prev.filter(u => u.id !== userId));
      setStats(prev => ({ ...prev, total_users: Math.max(0, prev.total_users - 1) }));
      addNotification('Eliminado', 'Usuario borrado correctamente');
    } catch (err) {
      console.error("Delete user error:", err, err.status, err.response?.data);
      
      if (err.status === 404) {
        addNotification('Aviso', 'El usuario ya había sido eliminado de la base de datos.', 'gold');
        setUsers(prev => prev.filter(u => u.id !== userId));
        setStats(prev => ({ ...prev, total_users: Math.max(0, prev.total_users - 1) }));
      } else {
        addNotification('Error', err.response?.data?.detail || err.message || 'No se pudo eliminar el usuario', 'error');
      }
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleSyncData = async (type) => {
    setIsSyncing(true);
    addNotification('Sincronizando', `Iniciando sincronización de ${type}...`, 'gold');
    try {
      if (type === 'all') {
        // Sync everything sequentially
        await api.post('/sync/matches');
        await api.post('/sync/standings');
        addNotification('Sincronizado', 'Sincronización general finalizada');
      } else {
        let endpoint;
        if (type === 'players') endpoint = '/sync/players';
        else if (type === 'scorers') endpoint = '/sync/scorers';
        else if (type === 'matches') endpoint = '/sync/matches';
        else endpoint = '/sync/standings';

        const res = await api.post(endpoint);
        addNotification('Sincronizado', `Sincronización de ${type} finalizada: ${res.updated || 0} actualizados, ${res.created || 0} creados`);
      }
      fetchAdminData();
    } catch (err) {
      console.error(err);
      addNotification('Error', 'Sincronización fallida. Puede ser por límites de la API externa.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const openMatchEdit = (match) => {
    setEditingMatch(match);
    setMatchUpdate({
      home_score: match.home_score || 0,
      away_score: match.away_score || 0,
      status: match.status || 'finished'
    });
  };

  const handleUpdateMatch = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/admin/matches/${editingMatch.id}`, matchUpdate);
      addNotification('Actualizado', 'Resultado del partido guardado');
      setEditingMatch(null);
      fetchAdminData();
    } catch (err) {
      console.error(err);
      addNotification('Error', 'Error al actualizar el partido', 'error');
    }
  };

  const getFlagUrl = (team) => {
    if (!team) return '';
    if (team.logo_url && team.logo_url.startsWith('http')) return team.logo_url;
    const code = team.country_code?.toLowerCase() || 'un';
    return `https://flagcdn.com/w80/${code}.png`;
  };

  const translateStatus = (status) => {
    const map = {
      'scheduled': 'Pendiente',
      'live': 'En Vivo',
      'finished': 'Finalizado',
      'postponed': 'Pospuesto'
    };
    return map[status] || status;
  };

  if (loading) return <LoadingScreen text="CONTROL ADMIN..." />;

  return (
    <div className="view" style={{animation: 'fadeIn 0.4s ease-out forwards'}}>
      {/* Notifications Portal */}
      <div className="notification-container">
        {notifications.map(n => (
          <div key={n.id} className={`notification ${n.type}`}>
            <div className="notification-icon">
              {n.type === 'success' ? <i className="ri-checkbox-circle-fill" style={{color: 'var(--green)'}}></i> : 
               n.type === 'error' ? <i className="ri-error-warning-fill" style={{color: 'var(--red)'}}></i> :
               <i className="ri-time-fill" style={{color: 'var(--gold)'}}></i>}
            </div>
            <div className="notification-content">
              <span className="notification-title">{n.title}</span>
              <span className="notification-msg">{n.msg}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-header">
        <h1 className="admin-title">Panel de Control</h1>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
          <div className="admin-badge">Admin Mode Active</div>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <i className="ri-dashboard-line"></i> Dashboard
        </button>
        <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          <i className="ri-group-line"></i> Usuarios
        </button>
        <button className={`admin-tab ${activeTab === 'matches' ? 'active' : ''}`} onClick={() => setActiveTab('matches')}>
          <i className="ri-football-line"></i> Partidos
        </button>
        <button className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          <i className="ri-settings-4-line"></i> Configuración
        </button>
        <button className={`admin-tab ${activeTab === 'especiales' ? 'active' : ''}`} onClick={() => setActiveTab('especiales')}>
          <i className="ri-star-line"></i> Especiales
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <div className="tab-content" style={{animation: 'slideUp 0.3s ease-out'}}>
          <div className="admin-stats">
            <div className="stat-card">
              <div className="stat-value">{stats.total_users}</div>
              <div className="stat-label">Participantes</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.total_predictions}</div>
              <div className="stat-label">Predicciones Totales</div>
            </div>
            <div className="stat-card" style={{borderLeftColor: 'var(--gold)'}}>
              <div className="stat-value">{stats.matches_pending_update}</div>
              <div className="stat-label">Partidos por Actualizar</div>
            </div>
          </div>

          <div className="admin-card">
            <h3 className="section-title">Sincronización del Sistema</h3>
            <p style={{color: 'var(--text-gray)', marginBottom: '1.5rem'}}>
              Utiliza estas herramientas para mantener los datos del torneo actualizados desde la API externa.
            </p>
            <div className="admin-sync-section" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem'}}>
               <button className="action-btn primary" onClick={() => handleSyncData('all')} disabled={isSyncing}>
                  <i className="ri-global-line"></i> Sincronización General
               </button>
               <button className="action-btn" onClick={() => handleSyncData('matches')} disabled={isSyncing}>
                  <i className="ri-football-line"></i> Sincronizar Partidos
               </button>
               <button className="action-btn" onClick={() => handleSyncData('players')} disabled={isSyncing}>
                  <i className="ri-refresh-line"></i> Sincronizar Jugadores
               </button>
               <button className="action-btn" onClick={() => handleSyncData('scorers')} disabled={isSyncing}>
                  <i className="ri-medal-line"></i> Actualizar Goleadores
               </button>
            </div>
            {isSyncing && (
              <div style={{marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold)', fontWeight: 700}}>
                <i className="ri-loader-4-line ri-spin"></i> Procesando... esto puede tardar unos segundos.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="tab-content" style={{animation: 'slideUp 0.3s ease-out'}}>
          {viewingUserBracket ? (
            <div className="admin-card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-light)' }}>
                <h3 className="section-title" style={{ margin: 0 }}>Llaves de {viewingUserBracket.display_name}</h3>
                <button className="action-btn" onClick={() => setViewingUserBracket(null)}>
                  <i className="ri-arrow-left-line"></i> Volver a Usuarios
                </button>
              </div>
              <div style={{ minHeight: '600px' }}>
                <BracketPredictor adminUserId={viewingUserBracket.id} userRole="admin" />
              </div>
            </div>
          ) : (
            <div className="admin-card">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
                <h3 className="section-title">Gestión de Participantes</h3>
                <button className="action-btn primary" onClick={() => setShowCreateModal(true)}>
                  <i className="ri-user-add-line"></i> Nuevo Usuario
                </button>
              </div>
              <div className="admin-table-wrapper">
                <table className="lb-table">
                  <thead>
                    <tr><th>Participante</th><th>Email</th><th>Rol</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div className="user-cell">
                            <div className="u-avatar" style={{width: '32px', height: '32px', overflow: 'hidden', padding: 0}}>
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt={u.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                              ) : (
                                u.display_name?.substring(0,2).toUpperCase()
                              )}
                            </div>
                            {u.display_name}
                          </div>
                        </td>
                        <td style={{fontSize: '0.85rem', color: '#666'}}>{u.email}</td>
                        <td><span className={`badge-urgency ${u.role === 'admin' ? 'live' : ''}`}>{u.role}</span></td>
                        <td>
                          {u.role !== 'admin' && (
                            <button 
                              className="action-btn primary" 
                              onClick={() => setViewingUserBracket(u)}
                              style={{ marginRight: '0.5rem' }}
                              title="Ver Llaves"
                            >
                                <i className="ri-eye-line"></i>
                            </button>
                          )}
                           <button 
                             className="action-btn danger" 
                             disabled={deletingUserId === u.id}
                             onClick={() => handleDeleteUser(u.id)}
                           >
                              {deletingUserId === u.id ? <i className="ri-loader-4-line ri-spin"></i> : <i className="ri-delete-bin-line"></i>}
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'matches' && (
        <div className="tab-content" style={{animation: 'slideUp 0.3s ease-out'}}>
          <div className="admin-card">
            <h3 className="section-title">Control de Partidos</h3>
            <p style={{color: 'var(--text-gray)', marginBottom: '1.5rem'}}>Actualiza los resultados manualmente si la sincronización automática no está disponible.</p>
            
            <div className="admin-matches-grouped">
              {Object.entries(matches.reduce((acc, m) => {
                const group = m.group_name || 'Eliminatorias';
                if (!acc[group]) acc[group] = [];
                acc[group].push(m);
                return acc;
              }, {}))
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([group, groupMatches]) => (
                <div key={group} className="admin-group-section" style={{marginBottom: '2rem'}}>
                  <h4 style={{
                    background: 'var(--bg-light)', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '8px', 
                    color: 'var(--gold-dark)',
                    fontSize: '0.9rem',
                    textTransform: 'uppercase',
                    marginBottom: '1rem',
                    borderLeft: '4px solid var(--gold)'
                  }}>{group}</h4>
                  <div className="admin-table-wrapper">
                    <table className="lb-table" style={{marginBottom: '1rem'}}>
                      <thead>
                        <tr><th>Fecha</th><th>Encuentro</th><th>Estado</th><th>Resultado</th><th>Acción</th></tr>
                      </thead>
                      <tbody>
                        {[...groupMatches]
                          .sort((a, b) => {
                            const dateA = new Date(a.match_date || a.utc_date).getTime();
                            const dateB = new Date(b.match_date || b.utc_date).getTime();
                            return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
                          })
                          .map(m => (
                          <tr key={m.id}>
                            <td style={{fontSize: '0.75rem', color: '#666'}}>
                              {new Date(m.match_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td style={{fontSize: '0.85rem'}}>
                              <div style={{display: 'flex', alignItems: 'center', gap: '0.6rem'}}>
                                <img src={getFlagUrl(m.home_team)} style={{width: '24px', height: '16px', objectFit: 'cover', borderRadius: '2px', border: '1px solid #eee'}} />
                                <span style={{fontWeight: 700}}>{getTranslatedName(m.home_team?.name)}</span>
                                <span style={{color: '#999'}}>vs</span>
                                <span style={{fontWeight: 700}}>{getTranslatedName(m.away_team?.name)}</span>
                                <img src={getFlagUrl(m.away_team)} style={{width: '24px', height: '16px', objectFit: 'cover', borderRadius: '2px', border: '1px solid #eee'}} />
                              </div>
                            </td>
                            <td>
                              <span className={`status-tag ${m.status}`} style={{fontSize: '0.7rem', padding: '2px 8px'}}>
                                {translateStatus(m.status)}
                              </span>
                            </td>
                            <td style={{fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--bg-dark)'}}>
                              {m.home_score} - {m.away_score}
                            </td>
                            <td>
                              <button className="action-btn" onClick={() => openMatchEdit(m)} style={{padding: '5px 12px', fontSize: '0.8rem'}}>
                                <i className="ri-edit-line"></i> Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && config && (
        <div className="tab-content" style={{animation: 'slideUp 0.3s ease-out'}}>
          <div className="admin-card">
            <h3 className="section-title">Configuración de la Polla</h3>
            <p style={{color: 'var(--text-gray)', marginBottom: '2rem'}}>Administra los puntos y los plazos globales del sistema.</p>
            
            <form className="admin-form" onSubmit={handleUpdateConfig} style={{maxWidth: '800px'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem'}}>
                <div className="form-section">
                  <h4 style={{marginBottom: '1rem', color: 'var(--gold)', borderBottom: '1px solid #eee', paddingBottom: '0.5rem'}}>
                    <i className="ri-medal-fill"></i> Puntuación Fase de Grupos
                  </h4>
                  <div className="form-group">
                    <label>Puntos Resultado Exacto</label>
                    <input type="number" className="form-input" value={config.points_exact_score} onChange={e => setConfig({...config, points_exact_score: parseInt(e.target.value)})}/>
                  </div>
                  <div className="form-group">
                    <label>Puntos Resultado (Ganador/Empate)</label>
                    <input type="number" className="form-input" value={config.points_correct_result} onChange={e => setConfig({...config, points_correct_result: parseInt(e.target.value)})}/>
                  </div>
                </div>

                <div className="form-section">
                  <h4 style={{marginBottom: '1rem', color: 'var(--gold)', borderBottom: '1px solid #eee', paddingBottom: '0.5rem'}}>
                    <i className="ri-organization-chart"></i> Puntuación Llaves (Fase Final)
                  </h4>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                    <div className="form-group">
                      <label>16vos a 8vos</label>
                      <input type="number" className="form-input" value={config.points_bracket_r16} onChange={e => setConfig({...config, points_bracket_r16: parseInt(e.target.value)})}/>
                    </div>
                    <div className="form-group">
                      <label>8vos a 4tos</label>
                      <input type="number" className="form-input" value={config.points_bracket_qf} onChange={e => setConfig({...config, points_bracket_qf: parseInt(e.target.value)})}/>
                    </div>
                    <div className="form-group">
                      <label>Semis</label>
                      <input type="number" className="form-input" value={config.points_bracket_sf} onChange={e => setConfig({...config, points_bracket_sf: parseInt(e.target.value)})}/>
                    </div>
                    <div className="form-group">
                      <label>Final (Campeón)</label>
                      <input type="number" className="form-input" value={config.points_bracket_final} onChange={e => setConfig({...config, points_bracket_final: parseInt(e.target.value)})}/>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 style={{marginBottom: '1rem', color: 'var(--gold)', borderBottom: '1px solid #eee', paddingBottom: '0.5rem'}}>
                    <i className="ri-star-fill"></i> Puntuación Especiales
                  </h4>
                  <div className="form-group">
                    <label>Acierto Campeón</label>
                    <input type="number" className="form-input" value={config.points_special_champion} onChange={e => setConfig({...config, points_special_champion: parseInt(e.target.value)})}/>
                  </div>
                  <div className="form-group">
                    <label>Acierto Subcampeón</label>
                    <input type="number" className="form-input" value={config.points_special_subchampion} onChange={e => setConfig({...config, points_special_subchampion: parseInt(e.target.value)})}/>
                  </div>
                  <div className="form-group">
                    <label>Acierto Tercer Lugar</label>
                    <input type="number" className="form-input" value={config.points_special_third_place} onChange={e => setConfig({...config, points_special_third_place: parseInt(e.target.value)})}/>
                  </div>
                  <div className="form-group">
                    <label>Acierto Goleador</label>
                    <input type="number" className="form-input" value={config.points_special_scorer} onChange={e => setConfig({...config, points_special_scorer: parseInt(e.target.value)})}/>
                  </div>
                  <div className="form-group">
                    <label>Acierto Mejor Jugador</label>
                    <input type="number" className="form-input" value={config.points_special_best_player} onChange={e => setConfig({...config, points_special_best_player: parseInt(e.target.value)})}/>
                  </div>
                </div>

                <div className="form-section">
                  <h4 style={{marginBottom: '1rem', color: 'var(--gold)', borderBottom: '1px solid #eee', paddingBottom: '0.5rem'}}>
                    <i className="ri-lock-fill"></i> Accesos y Plazos
                  </h4>
                  <div className="form-group" style={{flexDirection: 'row', alignItems: 'center', gap: '1rem'}}>
                    <input type="checkbox" checked={config.is_registration_open} onChange={e => setConfig({...config, is_registration_open: e.target.checked})}/>
                    <label style={{marginBottom: 0}}>Inscripciones Abiertas</label>
                  </div>
                  <div className="form-group" style={{flexDirection: 'row', alignItems: 'center', gap: '1rem', marginTop: '1rem'}}>
                    <input type="checkbox" checked={config.is_bracket_open} onChange={e => setConfig({...config, is_bracket_open: e.target.checked})}/>
                    <label style={{marginBottom: 0}}>Predicciones de Llaves Abiertas</label>
                  </div>
                  <div className="form-group" style={{marginTop: '1.5rem'}}>
                    <label>Fecha Límite Inscripción</label>
                    <input type="datetime-local" className="form-input" 
                      value={config.entry_deadline ? toLocalISOString(config.entry_deadline) : ''} 
                      onChange={e => setConfig({...config, entry_deadline: e.target.value ? new Date(e.target.value).toISOString() : null})}/>
                  </div>
                </div>
              </div>

              <div style={{marginTop: '3rem', borderTop: '1px solid #eee', paddingTop: '2rem'}}>
                <button type="submit" className="btn-save admin-save-config-btn" disabled={isUpdatingConfig} style={{width: 'auto', padding: '1rem 4rem'}}>
                  {isUpdatingConfig ? 'Guardando...' : 'Guardar Todos los Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'especiales' && (
        <div className="tab-content" style={{animation: 'slideUp 0.3s ease-out'}}>
          <div className="admin-card">
            <h3 className="section-title">Gestión de Apuestas Especiales</h3>
            <p style={{color: 'var(--text-gray)', marginBottom: '1.5rem'}}>
              Configura la fecha límite de cada categoría y resuelve las apuestas una vez cerradas.
            </p>
            <div className="admin-table-wrapper">
              <table className="lb-table">
                <thead>
                  <tr><th>Categoría</th><th>Puntos</th><th>Estado</th><th>Fecha Límite (Local)</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {specialBets.map(bet => {
                    const currentDeadlineStr = editingDeadline[bet.id] !== undefined
                      ? editingDeadline[bet.id]
                      : (bet.deadline ? toLocalISOString(bet.deadline) : '');
                    const isExpired = bet.deadline && new Date() > new Date(bet.deadline);

                    return (
                      <tr key={bet.id}>
                        <td><div className="user-cell" style={{fontWeight: 700}}>{bet.name}</div></td>
                        <td>{bet.points_reward} pts</td>
                        <td>
                          <span className={`badge-urgency ${bet.is_resolved ? 'live' : isExpired ? 'delayed' : ''}`}>
                            {bet.is_resolved ? 'RESUELTO' : isExpired ? 'CERRADO' : 'ABIERTO'}
                          </span>
                        </td>
                        <td style={{minWidth: '220px'}}>
                          <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                            <input
                              type="datetime-local"
                              className="form-input"
                              style={{fontSize: '0.8rem', padding: '4px 8px', margin: 0, flex: 1}}
                              value={currentDeadlineStr}
                              onChange={e => setEditingDeadline(prev => ({...prev, [bet.id]: e.target.value}))}
                            />
                            {editingDeadline[bet.id] !== undefined && editingDeadline[bet.id] !== (bet.deadline ? toLocalISOString(bet.deadline) : '') && (
                              <button
                                className="action-btn primary"
                                style={{padding: '4px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap'}}
                                disabled={savingDeadline === bet.id}
                                onClick={() => handleUpdateDeadline(bet.id)}
                              >
                                {savingDeadline === bet.id ? '...' : <><i className="ri-save-line"></i> Guardar</>}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <button className="action-btn primary" onClick={() => {
                            setResolvingSpecial(bet);
                            setSpecialAnswer('');
                          }}>
                            <i className="ri-check-double-line"></i> Resolver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SPECIAL BET RESOLUTION MODAL */}
      {resolvingSpecial && (
        <div className="admin-modal-overlay" onClick={() => setResolvingSpecial(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h2 className="display-text" style={{color: 'var(--red)', fontSize: '2rem', marginBottom: '1rem'}}>{resolvingSpecial.name}</h2>
            <p style={{marginBottom: '1.5rem', color: 'var(--text-gray)'}}>
              Ingresa el nombre oficial del ganador. El sistema otorgará <b>{resolvingSpecial.points_reward} puntos</b> a quienes coincidan (Fuzzy Match).
            </p>
            <form className="admin-form" onSubmit={handleResolveSpecial}>
              <div className="form-group">
                <label>Respuesta Ganadora</label>
                {resolvingSpecial.bet_type === 'team' ? (
                  <select 
                    className="form-select" 
                    required 
                    value={specialAnswer} 
                    onChange={e => setSpecialAnswer(e.target.value)}
                  >
                    <option value="">Selecciona un equipo...</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>
                        {getTranslatedName(t.name)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    className="form-input" 
                    autoFocus
                    placeholder="Ej: Kylian Mbappé"
                    required 
                    value={specialAnswer} 
                    onChange={e => setSpecialAnswer(e.target.value)}
                  />
                )}
              </div>
              <div className="modal-actions" style={{marginTop: '2rem'}}>
                <button type="button" className="btn-cancel" onClick={() => setResolvingSpecial(null)}>Cancelar</button>
                <button type="submit" className="btn-save" style={{background: 'var(--green)'}}>Validar y Resolver</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="admin-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h2>Nuevo Usuario</h2>
            <form className="admin-form" onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>Nombre Completo</label>
                <input type="text" className="form-input" required value={newUserData.display_name} onChange={e => setNewUserData({...newUserData, display_name: e.target.value})}/>
              </div>
              <div className="form-group">
                <label>Correo Electrónico</label>
                <input type="email" className="form-input" required value={newUserData.email} onChange={e => setNewUserData({...newUserData, email: e.target.value})}/>
              </div>
              <div className="form-group">
                <label>Contraseña</label>
                <input type="password" className="form-input" required value={newUserData.password} onChange={e => setNewUserData({...newUserData, password: e.target.value})}/>
              </div>
              <div className="form-group">
                <label>Rol</label>
                <select className="form-select" value={newUserData.role} onChange={e => setNewUserData({...newUserData, role: e.target.value})}>
                  <option value="participant">Participante</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button type="submit" className="btn-save">Crear Usuario</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MATCH MODAL */}
      {editingMatch && (
        <div className="admin-modal-overlay" onClick={() => setEditingMatch(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h2>Actualizar Partido</h2>
            <p style={{marginBottom: '1.5rem', fontWeight: 700}}>{getTranslatedName(editingMatch.home_team?.name)} vs {getTranslatedName(editingMatch.away_team?.name)}</p>
            <form className="admin-form" onSubmit={handleUpdateMatch}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                <div className="form-group">
                  <label>Goles Local</label>
                  <input type="number" className="form-input" value={matchUpdate.home_score} onChange={e => setMatchUpdate({...matchUpdate, home_score: e.target.value === '' ? '' : parseInt(e.target.value)})}/>
                </div>
                <div className="form-group">
                  <label>Goles Visitante</label>
                  <input type="number" className="form-input" value={matchUpdate.away_score} onChange={e => setMatchUpdate({...matchUpdate, away_score: e.target.value === '' ? '' : parseInt(e.target.value)})}/>
                </div>
              </div>
              <div className="form-group">
                <label>Estado del Partido</label>
                <select className="form-select" value={matchUpdate.status} onChange={e => setMatchUpdate({...matchUpdate, status: e.target.value})}>
                  <option value="scheduled">Programado</option>
                  <option value="live">En Vivo</option>
                  <option value="finished">Finalizado</option>
                  <option value="postponed">Pospuesto</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setEditingMatch(null)}>Cancelar</button>
                <button type="submit" className="btn-save">Guardar Resultado</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
