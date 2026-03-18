import React, { useEffect } from 'react';
import { Spin } from 'antd';
import { useAuthStore, type AuthUser } from '../../store/authStore';
import { LoginPage } from './LoginPage';

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const { isCheckingAuth, accessToken, setAuth, clearAuth } = useAuthStore();

  // On mount: try to restore session via httpOnly cookie
  useEffect(() => {
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          clearAuth();
          return;
        }
        const data = (await res.json()) as { accessToken: string; user: AuthUser };
        setAuth(data.accessToken, data.user);
      })
      .catch(() => clearAuth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isCheckingAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!accessToken) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
