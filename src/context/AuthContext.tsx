import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: 'authority' | 'admin' | 'superadmin';
  department: string;
  institute: string;
}

interface AuthContextType {
  admin: Admin | null;
  login: (data: Admin) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem('campusvoice_admin');
    if (saved) {
      try { setAdmin(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const login = (data: Admin) => {
    localStorage.setItem('campusvoice_admin', JSON.stringify(data));
    setAdmin(data);
    navigate('/complaints');
  };

  const logout = () => {
    localStorage.removeItem('campusvoice_admin');
    setAdmin(null);
    navigate('/');
  };

  return (
    <AuthContext.Provider value={{ admin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
