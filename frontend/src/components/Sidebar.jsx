import { useState } from 'react';

export default function Sidebar({ currentView, navigateTo, isAdminMode, userRole }) {
  const [kickAnim, setKickAnim] = useState(false);

  const handleLogoClick = () => {
    setKickAnim(false);
    setTimeout(() => setKickAnim(true), 10);
  };

  return (
    <nav className="sidebar">
      <div 
        className={`sidebar-logo ${kickAnim ? 'kick-anim' : ''}`} 
        onClick={handleLogoClick}
        title="Click me!"
      >
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" fill="none"/>
          <path d="M7 8L12 11.5L17 8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M12 11.5V18" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M4 14.5L7 16.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M20 14.5L17 16.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        </svg>
        <span className="sidebar-logo-text">Polla mundialista</span>
      </div>
      
      <div className="nav-items">
        <button 
          className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} 
          onClick={() => navigateTo('dashboard')}
        >
          <i className="ri-dashboard-fill"></i><span>Dashboard</span>
        </button>
        <button 
          className={`nav-item ${currentView === 'matches' ? 'active' : ''}`} 
          onClick={() => navigateTo('matches')}
        >
          <i className="ri-calendar-event-fill"></i><span>Partidos</span>
        </button>
        <button 
          className={`nav-item ${currentView === 'predictions' ? 'active' : ''}`} 
          onClick={() => navigateTo('predictions')}
        >
          <i className="ri-focus-3-fill"></i><span>Mis Predicciones</span>
        </button>

        <button 
          className={`nav-item ${currentView === 'specials' ? 'active' : ''}`} 
          onClick={() => navigateTo('specials')}
        >
          <i className="ri-vip-crown-fill"></i><span>Especiales</span>
        </button>
        <button 
          className={`nav-item ${currentView === 'leaderboard' ? 'active' : ''}`} 
          onClick={() => navigateTo('leaderboard')}
        >
          <i className="ri-bar-chart-grouped-fill"></i><span>Ranking</span>
        </button>
        {userRole === 'admin' && isAdminMode && (
          <button 
            className={`nav-item ${currentView === 'admin' ? 'active' : ''}`} 
            onClick={() => navigateTo('admin')}
          >
            <i className="ri-settings-4-fill"></i><span>Admin Panel</span>
          </button>
        )}
      </div>
    </nav>
  );
}
