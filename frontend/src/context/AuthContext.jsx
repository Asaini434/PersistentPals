import React, { createContext, useContext, useState } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

// Preset accounts for Admin and Provider credentials
export const PRESET_CREDENTIALS = {
  admin: {
    email: 'admin@example.com',
    password: 'demo-password',
  },
  provider: {
    email: 'sarah.jenkins@example.com',
    password: 'demo-password',
  },
};

const STORAGE_KEY = 'reflectx_auth_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return parsed.user && parsed.access_token ? parsed.user : null;
    } catch {
      return null;
    }
  });

  const [authError, setAuthError] = useState('');

  const login = async (email, password) => {
    setAuthError('');
    try {
      const session = await authService.login({ email, password });
      setUser(session.user);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return { success: true, role: session.user.role };
    } catch (error) {
      const message = error.message || 'Unable to sign in. Please try again.';
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const logout = () => {
    setUser(null);
    setAuthError('');
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isProvider: user?.role === 'provider',
        login,
        logout,
        authError,
        setAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
