import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';

export function RequireAuth() {
  const location = useLocation();
  const { accessToken, bootstrapped, bootstrap } = useAuthStore();

  useEffect(() => {
    if (!bootstrapped) {
      void bootstrap();
    }
  }, [bootstrap, bootstrapped]);

  if (!bootstrapped) {
    return (
      <div className="route-loading">
        <span className="route-loading-indicator" />
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
