import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

import { RequireAuth } from '@/components/RequireAuth';
import { AppShell } from '@/layouts/AppShell';

const ChartEditorPage = lazy(() => import('@/pages/ChartEditorPage').then((module) => ({ default: module.ChartEditorPage })));
const ChartsPage = lazy(() => import('@/pages/ChartsPage').then((module) => ({ default: module.ChartsPage })));
const DataSourcesPage = lazy(() => import('@/pages/DataSourcesPage').then((module) => ({ default: module.DataSourcesPage })));
const DatasetsPage = lazy(() => import('@/pages/DatasetsPage').then((module) => ({ default: module.DatasetsPage })));
const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const WorkspacesPage = lazy(() => import('@/pages/WorkspacesPage').then((module) => ({ default: module.WorkspacesPage })));
const PublishedDashboardPage = lazy(() => import('@/pages/PublishedDashboardPage').then((module) => ({ default: module.PublishedDashboardPage })));
const PublicDashboardPage = lazy(() => import('@/pages/PublicDashboardPage').then((module) => ({ default: module.PublicDashboardPage })));

function RouteFallback() {
  return <div className="route-loading"><Spin size="large" /></div>;
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/share/:token" element={<PublicDashboardPage />} />
        <Route path="/embed/:token" element={<PublicDashboardPage embed />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/charts" element={<ChartsPage />} />
            <Route path="/charts/new" element={<ChartEditorPage />} />
            <Route path="/charts/:id/edit" element={<ChartEditorPage />} />
            <Route path="/dashboards/:id" element={<PublishedDashboardPage />} />
            <Route path="/data-sources" element={<DataSourcesPage />} />
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
            <Route path="/" element={<Navigate to="/charts" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/charts" replace />} />
      </Routes>
    </Suspense>
  );
}
