import React, { createContext, useContext, useState, useCallback } from 'react';
import { api, DEMO_USERS, setActiveDemoUser } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEMO_USERS.admin);

  const switchDemoUser = useCallback((username) => {
    const next = DEMO_USERS[username] || DEMO_USERS.admin;
    setActiveDemoUser(next.username);
    setUser(next);
  }, []);

  const refreshAuth = useCallback(async () => {
    const me = await api.getAuthMe();
    const u = me?.user ?? me;
    setUser(u);
    return { setupRequired: false, user: u };
  }, []);

  const login = useCallback(async ({ username }) => {
    const next = DEMO_USERS[username] || DEMO_USERS.admin;
    setActiveDemoUser(next.username);
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    // In interactive demo, keep user signed in or reset to admin
    setActiveDemoUser('admin');
    setUser(DEMO_USERS.admin);
  }, []);

  const value = {
    user,
    userRole: user?.role || 'admin',
    isAuthenticated: true,
    authChecked: true,
    setupRequired: false,
    refreshAuth,
    login,
    setup: async () => DEMO_USERS.admin,
    acceptInvitation: async () => DEMO_USERS.admin,
    logout,
    switchDemoUser,
    demoUsers: Object.values(DEMO_USERS),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useCanWrite() {
  const { user, userRole } = useAuth();
  if (userRole === 'admin') return true;
  if (user?.permissions?.access_level) {
    return user.permissions.access_level === 'write';
  }
  return userRole === 'member';
}

export function useIsAdmin() {
  const { userRole } = useAuth();
  return userRole === 'admin';
}
