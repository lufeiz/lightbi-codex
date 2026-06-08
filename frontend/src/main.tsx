import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/global.css';
import { initPerformanceMonitoring } from '@/features/charts/chartUtils';

const AntdProviders = lazy(() => import('@/AntdProviders').then((module) => ({ default: module.AntdProviders })));
const App = lazy(() => import('@/App').then((module) => ({ default: module.App })));

initPerformanceMonitoring();

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={<RouteLoading />}>
      <AntdProviders>
        <App />
      </AntdProviders>
    </Suspense>
  </React.StrictMode>
);

function RouteLoading() {
  return (
    <div className="route-loading">
      <span className="route-loading-indicator" />
    </div>
  );
}
