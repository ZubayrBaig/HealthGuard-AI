import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import api, { setAccessTokenGetter } from '../utils/api';

const AuthContext = createContext(null);

const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID;
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE;

export const isAuthEnabled = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);

// ---------------------------------------------------------------------------
// Inner provider — uses the Auth0 hook (must be inside Auth0Provider)
// ---------------------------------------------------------------------------

function InnerAuthProvider({ children }) {
  const {
    isAuthenticated,
    isLoading,
    user,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
    getIdTokenClaims,
  } = useAuth0();

  const [patient, setPatient] = useState(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(
    () => localStorage.getItem('healthguard_demo_mode') === 'true',
  );

  // Wire the token getter into the axios interceptor.
  // When an API audience is configured, use the access token.
  // Otherwise fall back to the raw ID token (always a JWT with aud = client ID).
  useEffect(() => {
    if (isAuthenticated) {
      if (AUTH0_AUDIENCE) {
        setAccessTokenGetter(() =>
          getAccessTokenSilently({ authorizationParams: { audience: AUTH0_AUDIENCE } }),
        );
      } else {
        setAccessTokenGetter(async () => {
          const claims = await getIdTokenClaims();
          return claims?.__raw;
        });
      }
    }
  }, [isAuthenticated, getAccessTokenSilently, getIdTokenClaims]);

  // Link patient after successful Auth0 login
  useEffect(() => {
    if (!isAuthenticated || isDemoMode) return;

    async function linkPatient() {
      setPatientLoading(true);
      try {
        const { data } = await api.post('/api/auth/link-patient');
        setPatient(data);
      } catch (err) {
        console.error('Failed to link patient:', err);
      } finally {
        setPatientLoading(false);
      }
    }

    linkPatient();
  }, [isAuthenticated, isDemoMode]);

  const enterDemoMode = useCallback(() => {
    localStorage.setItem('healthguard_demo_mode', 'true');
    setIsDemoMode(true);
  }, []);

  const exitDemoMode = useCallback(() => {
    localStorage.removeItem('healthguard_demo_mode');
    setIsDemoMode(false);
    setPatient(null);
  }, []);

  const handleLogout = useCallback(() => {
    exitDemoMode();
    logout({ logoutParams: { returnTo: window.location.origin } });
  }, [logout, exitDemoMode]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: isAuthenticated || isDemoMode,
        isLoading,
        user,
        patient,
        patientLoading,
        isDemoMode,
        loginWithRedirect,
        logout: handleLogout,
        enterDemoMode,
        exitDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Outer provider — conditionally wraps with Auth0Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }) {
  const navigate = useNavigate();

  if (!isAuthEnabled) {
    // No Auth0 configured — dev mode, everything accessible
    return (
      <AuthContext.Provider
        value={{
          isAuthenticated: true,
          isLoading: false,
          user: null,
          patient: null,
          patientLoading: false,
          isDemoMode: true,
          loginWithRedirect: () => {},
          logout: () => {},
          enterDemoMode: () => {},
          exitDemoMode: () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
      }}
      onRedirectCallback={(appState) => {
        navigate(appState?.returnTo || '/dashboard');
      }}
    >
      <InnerAuthProvider>{children}</InnerAuthProvider>
    </Auth0Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
