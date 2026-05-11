import logo from '../assets/copa.png';

export default function LoadingScreen({ text = "", isFixed = false }) {
  return (
    <div className="loading-screen" style={{ 
      position: isFixed ? 'fixed' : 'absolute',
      top: 0,
      left: 0,
      width: isFixed ? '100vw' : '100%',
      height: isFixed ? '100vh' : '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle, #1a2a3a 0%, #05080a 100%)',
      zIndex: 10000,
      overflow: 'hidden'
    }}>
      <div className="loading-trophy-container" style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Glow effect behind the trophy */}
        <div style={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(201,168,76,0.3) 0%, transparent 70%)',
          filter: 'blur(30px)',
          animation: 'pulse 2s infinite alternate'
        }}></div>
        
        {/* Glowing Burst Base */}
        <div style={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(201,168,76,0.2) 0%, transparent 70%)',
          zIndex: 1
        }}></div>

        {/* Sharp Rays (Center) */}
        <div className="rays" style={{
          position: 'absolute',
          width: '1200px',
          height: '1200px',
          background: 'repeating-conic-gradient(from 0deg, rgba(201,168,76,0.15) 0deg 0.5deg, transparent 5deg 10deg)',
          animation: 'rotate 20s linear infinite',
          opacity: 0.7,
          filter: 'blur(1px)',
          zIndex: 2
        }}></div>
        
        <div className="rays-slow" style={{
          position: 'absolute',
          width: '1000px',
          height: '1000px',
          background: 'repeating-conic-gradient(from 30deg, rgba(201,168,76,0.1) 0deg 0.3deg, transparent 8deg 12deg)',
          animation: 'rotate 40s linear infinite reverse',
          opacity: 0.5,
          filter: 'blur(2px)',
          zIndex: 2
        }}></div>

        <img 
          src={logo} 
          alt="Copa del Mundo" 
          style={{ 
            width: '240px', 
            height: 'auto', 
            filter: 'drop-shadow(0 0 30px rgba(201,168,76,0.6))',
            animation: 'loadingFloat 3s ease-in-out infinite',
            zIndex: 10,
            position: 'relative'
          }} 
        />
      </div>

      {text && (
        <div className="loading-text" style={{
          marginTop: '3rem',
          fontFamily: 'var(--font-display)',
          fontSize: '2.5rem',
          color: 'var(--gold)',
          letterSpacing: '8px',
          textShadow: '0 0 20px rgba(201,168,76,0.5)',
          animation: 'pulse 1.5s infinite',
          zIndex: 2
        }}>
          {text}
        </div>
      )}
    </div>
  );
}
