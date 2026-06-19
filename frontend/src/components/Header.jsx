import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function Header({ isAdminMode, toggleAdminMode, userRole, navigateTo }) {
  const [user, setUser] = useState({ display_name: '...', total_points: 0, position: '?' });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await api.get('/users/me');
        const rank = await api.get('/leaderboard/me');
        setUser({ ...profile, position: rank.position });
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.reload();
  };

  if (!user.display_name || user.display_name === '...') return null;

  return (
    <header className="top-header">
      <div className="user-profile tilt-card" onClick={() => navigateTo('profile')} style={{ cursor: 'pointer' }}>
        <div className="user-info">
          <span className="user-name">{user.display_name}</span>
          <span className="user-pts">{user.total_points} pts (Pos. {user.position !== undefined && user.position !== '?' ? user.position : '-'})</span>
        </div>
        <div className="avatar" style={user.avatar_url ? { overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}}>
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          ) : (
            user.display_name?.substring(0, 2).toUpperCase()
          )}
        </div>
        
        <div className="user-dropdown" onClick={(e) => e.stopPropagation()}>
          <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); navigateTo('profile'); }}><i className="ri-user-settings-line"></i> Mi Perfil</button>
          <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); navigateTo('leaderboard'); }}><i className="ri-history-line"></i> Historial</button>
          {userRole === 'admin' && (
            <button className="dropdown-item admin-toggle" onClick={(e) => { e.stopPropagation(); toggleAdminMode(); }}>
              {isAdminMode ? <><i className="ri-user-line"></i> Modo Usuario</> : <><i className="ri-spy-line"></i> Modo Admin</>}
            </button>
          )}
          <button className="dropdown-item" style={{color: 'var(--red)'}} onClick={(e) => { e.stopPropagation(); handleLogout(); }}><i className="ri-logout-box-r-line"></i> Salir</button>
        </div>
      </div>
    </header>
  );
}

