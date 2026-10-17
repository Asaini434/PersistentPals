import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// Preset accounts for Admin and Provider credentials
export const PRESET_CREDENTIALS = {
  admin: {
    email: 'admin@reflectx.com',
    password: 'admin123',
    name: 'Administrator (Operations Lead)',
    role: 'admin',
    department: 'Hospital Administration & Clinical Systems',
    title: 'System Administrator',
  },
  provider: {
    email: 'provider@reflectx.com',
    password: 'provider123',
    name: 'Dr. Sarah Jenkins, MD',
    role: 'provider',
    department: 'Cardiology',
    title: 'Lead Attending Cardiologist',
    providerId: 'PRV-201',
  },
};

const STORAGE_KEY = 'reflectx_auth_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [authError, setAuthError] = useState('');

  const login = (email, password) => {
    setAuthError('');
    const normalizedEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (
      normalizedEmail === PRESET_CREDENTIALS.admin.email.toLowerCase() &&
      cleanPassword === PRESET_CREDENTIALS.admin.password
    ) {
      const adminUser = {
        email: PRESET_CREDENTIALS.admin.email,
        name: PRESET_CREDENTIALS.admin.name,
        role: PRESET_CREDENTIALS.admin.role,
        department: PRESET_CREDENTIALS.admin.department,
        title: PRESET_CREDENTIALS.admin.title,
      };
      setUser(adminUser);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(adminUser));
      return { success: true, role: 'admin' };
    }

    if (
      normalizedEmail === PRESET_CREDENTIALS.provider.email.toLowerCase() &&
      cleanPassword === PRESET_CREDENTIALS.provider.password
    ) {
      const providerUser = {
        email: PRESET_CREDENTIALS.provider.email,
        name: PRESET_CREDENTIALS.provider.name,
        role: PRESET_CREDENTIALS.provider.role,
        department: PRESET_CREDENTIALS.provider.department,
        title: PRESET_CREDENTIALS.provider.title,
        providerId: PRESET_CREDENTIALS.provider.providerId,
      };
      setUser(providerUser);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(providerUser));
      return { success: true, role: 'provider' };
    }

    const err = 'Invalid email or password. Please use the designated Admin or Provider credentials.';
    setAuthError(err);
    return { success: false, error: err };
  };

  const logout = () => {
    setUser(null);
    setAuthError('');
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
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
