import { useState } from 'react';
import { api } from '../utils/api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${api.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Credenciales inválidas o usuario inactivo');
      }

      const data = await response.json();
      localStorage.setItem('token', data.access_token);

      const profileData = await api.get('/users/me');

      onLogin(profileData.role.toLowerCase(), data.access_token);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-card tilt-card" style={{ transformStyle: 'flat' }}>
        <div className="login-logo">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M7 8L12 11.5L17 8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 11.5V18" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M4 14.5L7 16.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M20 14.5L17 16.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <h1 className="login-title">POLLA <span>MUNDIALISTA</span></h1>
        </div>

        <h2 className="login-subtitle">Bienvenidos</h2>
        <p className="login-hint">Usa tus credenciales registradas.</p>

        {error && <div style={{ color: 'var(--red)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <i className="ri-mail-line"></i>
            <input
              type="email"
              placeholder="Correo electrónico"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <i className="ri-lock-line"></i>
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={isLoading} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
            {isLoading ? 'Cargando...' : 'Iniciar Sesión'} <i className="ri-arrow-right-line"></i>
          </button>
        </form>
      </div>
    </div>
  );
}

