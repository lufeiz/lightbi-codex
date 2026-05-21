import { Navigate, Route, Routes } from 'react-router-dom';

import { RequireAuth } from '@/components/RequireAuth';
import { AppShell } from '@/layouts/AppShell';
import { ChartEditorPage } from '@/pages/ChartEditorPage';
import { ChartsPage } from '@/pages/ChartsPage';
import { DataSourcesPage } from '@/pages/DataSourcesPage';
import { DatasetsPage } from '@/pages/DatasetsPage';
import { LoginPage } from '@/pages/LoginPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/charts" element={<ChartsPage />} />
          <Route path="/charts/new" element={<ChartEditorPage />} />
          <Route path="/charts/:id/edit" element={<ChartEditorPage />} />
          <Route path="/data-sources" element={<DataSourcesPage />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/" element={<Navigate to="/charts" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/charts" replace />} />
    </Routes>
  );
}
