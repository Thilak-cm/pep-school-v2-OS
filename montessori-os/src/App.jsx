import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import SignIn from "./SignIn";
import VoiceRecorder from "./VoiceRecorder";
import './App.css'

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        backgroundColor: '#f8fafc'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e2e8f0',
            borderTop: '4px solid #4f46e5',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <span style={{ color: '#64748b' }}>Loading...</span>
        </div>
      </div>
    );
  }

  // Landing Page - Not Authenticated
  if (!user) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '50px 20px',
        maxWidth: '600px',
        margin: '0 auto',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: '#f8fafc'
      }}>
        <img 
          src="/pep-logo.png" 
          alt="Pep School Logo" 
          style={{ 
            width: '150px', 
            height: 'auto', 
            marginBottom: '30px',
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))'
          }}
        />
        <h1 style={{ 
          color: '#1e293b', 
          marginBottom: '20px',
          fontSize: '2.5rem',
          fontWeight: '700',
          lineHeight: '1.2'
        }}>
          Welcome to Pep School V2 OS!
        </h1>
        <p style={{ 
          color: '#64748b', 
          marginBottom: '40px',
          fontSize: '1.2rem',
          lineHeight: '1.6',
          maxWidth: '500px',
          margin: '0 auto 40px auto'
        }}>
          Streamline your teaching workflow
        </p>
        <SignIn />
      </div>
    );
  }

  // Authenticated - Show Main App
  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f8fafc'
    }}>
      {/* Header */}
      <div style={{ 
        backgroundColor: 'white',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img 
              src="/pep-logo.png" 
              alt="Pep School Logo" 
              style={{ 
                width: '40px', 
                height: 'auto',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
              }}
            />
            <h1 style={{ 
              margin: 0, 
              color: '#1e293b',
              fontSize: '1.5rem',
              fontWeight: '600'
            }}>
              Montessori Observation Hub
            </h1>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#64748b',
              fontSize: '14px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {user.displayName?.charAt(0) || 'U'}
              </div>
              <span style={{ fontWeight: '500' }}>
                {user.displayName}
              </span>
            </div>
            <button 
              onClick={handleSignOut}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.1)'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#dc2626';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#ef4444';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '40px 24px'
      }}>
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}>
          {/* Welcome Section */}
          <div style={{
            textAlign: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{
              color: '#1e293b',
              fontSize: '1.875rem',
              fontWeight: '600',
              margin: '0 0 8px 0'
            }}>
              Capture Your Observations
            </h2>
            <p style={{
              color: '#64748b',
              fontSize: '1.1rem',
              margin: 0,
              lineHeight: '1.6'
            }}>
              Record voice notes up to 30 seconds for easy classroom documentation
            </p>
          </div>

          {/* Voice Recorder - Now styled better */}
          <VoiceRecorder />
          
          {/* Quick Stats or Tips */}
          
        </div>
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
