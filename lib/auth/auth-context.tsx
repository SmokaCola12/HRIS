'use client';

import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';

export type EmployeeRole = 'Employee' | 'Manager' | 'Admin' | 'CEO' | 'DEV';

export interface AuthUser {
  id: number;
  employeeId: string;
  name: string;
  username: string | null;
  email: string | null;
  role: EmployeeRole;
  departmentId: number | null;
  positionId: number | null;
  picture: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Not authenticated');
  }
  return res.json();
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  
  const { data, error, isLoading, mutate } = useSWR('/api/auth/me', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    onSuccess: () => setIsInitialized(true),
    onError: () => setIsInitialized(true),
  });

  const user = data?.user || null;

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      const responseData = await res.json();

      if (!res.ok) {
        return { success: false, error: responseData.error || 'Login failed' };
      }

      // Use the user data directly from login response to update SWR cache
      // This avoids the race condition where /me is called before cookie is set
      if (responseData.user) {
        await mutate({ user: responseData.user }, { revalidate: false });
      }
      
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }, [mutate]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    await mutate(null, { revalidate: false });
    router.push('/login');
  }, [mutate, router]);

  const refreshUser = useCallback(async () => {
    await mutate();
  }, [mutate]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (isInitialized && !isLoading && !user) {
      // Allow public routes
      const publicPaths = ['/login', '/'];
      if (!publicPaths.includes(window.location.pathname)) {
        router.push('/login');
      }
    }
  }, [isInitialized, isLoading, user, router]);

  return (
    <AuthContext.Provider value={{ user, isLoading: !isInitialized || isLoading, login, logout, refreshUser }}>
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

export function useRequireAuth(requiredRole?: EmployeeRole) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }

    if (!isLoading && user && requiredRole) {
      const roleHierarchy: Record<EmployeeRole, number> = {
        Employee: 1,
        Manager: 2,
        Admin: 3,
        CEO: 4,
        DEV: 5,
      };

      if (roleHierarchy[user.role] < roleHierarchy[requiredRole]) {
        router.push('/dashboard');
      }
    }
  }, [isLoading, user, requiredRole, router]);

  return { user, isLoading };
}
