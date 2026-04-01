import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  needsSetup: boolean;
  registrationEnabled: boolean;
  completeSetup: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      // Check if first-run setup is needed
      try {
        const setupStatus = await api.getSetupStatus();
        setNeedsSetup(setupStatus.needsSetup);
        setRegistrationEnabled(setupStatus.registrationEnabled);

        if (setupStatus.needsSetup) {
          setLoading(false);
          return;
        }
      } catch {
        // If setup status check fails, proceed with normal auth flow
      }

      // Check for stored token on mount
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) {
        setToken(storedToken);
        // Verify token and get user info
        try {
          const userData = await api.getCurrentUser();
          setUser(userData);
        } catch {
          // Invalid token, clear it
          localStorage.removeItem('authToken');
          setToken(null);
        }
      }
      setLoading(false);
    };

    initialize();
  }, []);

  const login = async (username: string, password: string) => {
    const response = await api.login(username, password);
    setUser(response.user);
    setToken(response.token);
    localStorage.setItem('authToken', response.token);
  };

  const register = async (username: string, password: string) => {
    const response = await api.register(username, password);
    setUser(response.user);
    setToken(response.token);
    localStorage.setItem('authToken', response.token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
    api.logout();
  };

  const completeSetup = async (newToken: string) => {
    localStorage.setItem('authToken', newToken);
    setToken(newToken);
    const userData = await api.getCurrentUser();
    setUser(userData);
    setNeedsSetup(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, needsSetup, registrationEnabled, completeSetup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

