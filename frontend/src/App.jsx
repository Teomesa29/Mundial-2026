import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Matches from './components/Matches';
import Predictions from './components/Predictions';
import Specials from './components/Specials';
import Leaderboard from './components/Leaderboard';
import AdminPanel from './components/AdminPanel';
import Profile from './components/Profile';
import Login from './components/Login';
import BracketPredictor from './components/BracketPredictor';
import LoadingScreen from './components/LoadingScreen';
import { api } from './utils/api';

import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('participant');
  const [currentView, setCurrentView] = useState('dashboard');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [appConfig, setAppConfig] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const [user, conf] = await Promise.all([
          api.get('/users/me'),
          api.get('/matches/config')
        ]);
        setUserRole(user.role);
        setAppConfig(conf);
        setIsAuthenticated(true);
        if (user.role === 'admin') {
          setIsAdminMode(true);
          document.documentElement.style.setProperty('--gold', '#E63946');
        }

        // Clean up legacy localStorage data, keeping only the token
        const keysToKeep = ['token', 'predictionsActiveTab'];
        Object.keys(localStorage).forEach(key => {
          if (!keysToKeep.includes(key)) {
            localStorage.removeItem(key);
          }
        });

      } catch {
        localStorage.removeItem('token');
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = (role, token) => {
    if (token) localStorage.setItem('token', token);
    setUserRole(role);
    if (role === 'admin') {
      setIsAdminMode(true);
      document.documentElement.style.setProperty('--gold', '#E63946');
    } else {
      setIsAdminMode(false);
      document.documentElement.style.setProperty('--gold', '#C9A84C');
    }
    setIsAuthenticated(true);
    setCurrentView('dashboard');
  };

  const navigateTo = (view) => {
    if (view === currentView) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentView(view);
      const mainContent = document.getElementById('main');
      if (mainContent) mainContent.scrollTop = 0;
      setIsTransitioning(false);
    }, 1000);
  };

  const toggleAdminMode = () => {
    if (userRole !== 'admin') return;
    const newMode = !isAdminMode;
    setIsAdminMode(newMode);
    document.documentElement.style.setProperty('--gold', newMode ? '#E63946' : '#C9A84C');
    if (!newMode && currentView === 'admin') {
      navigateTo('dashboard');
    }
  };

  if (loading) {
    return <LoadingScreen text="" isFixed={true} />;
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        currentView={currentView}
        navigateTo={navigateTo}
        isAdminMode={isAdminMode}
        userRole={userRole}
        config={appConfig}
      />

      <main className="main-content" id="main">
        {isTransitioning && <LoadingScreen text="" isFixed={true} />}
        
        <div style={{
          opacity: isTransitioning ? 0 : 1,
          transition: 'opacity 0.3s ease-in-out',
          minHeight: '100%'
        }}>
          <Header
            isAdminMode={isAdminMode}
            toggleAdminMode={toggleAdminMode}
            userRole={userRole}
            navigateTo={navigateTo}
          />

          {currentView === 'dashboard' && <Dashboard navigateTo={navigateTo} config={appConfig} />}
          {currentView === 'matches' && <Matches />}
          {currentView === 'predictions' && <Predictions userRole={userRole} navigateTo={navigateTo} />}
          {currentView === 'bracket' && <BracketPredictor navigateTo={navigateTo} userRole={userRole} />}
          {currentView === 'specials' && <Specials />}
          {currentView === 'leaderboard' && <Leaderboard />}
          {currentView === 'profile' && <Profile />}
          {currentView === 'admin' && isAdminMode && userRole === 'admin' && <AdminPanel />}
        </div>
      </main>
    </div>
  );
}

export default App;
