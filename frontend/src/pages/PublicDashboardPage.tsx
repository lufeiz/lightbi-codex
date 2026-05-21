import { Alert, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '@/api/client';
import { DashboardView } from '@/features/charts/DashboardView';
import type { PublishedDashboard } from '@/types/domain';

interface PublicDashboardPageProps {
  embed?: boolean;
}

export function PublicDashboardPage({ embed = false }: PublicDashboardPageProps) {
  const params = useParams();
  const token = params.token ?? '';
  const [data, setData] = useState<PublishedDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const request = embed ? api.publicEmbed(token) : api.publicShare(token);
    request
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '分享链接不可用'))
      .finally(() => setLoading(false));
  }, [embed, token]);

  if (loading) {
    return <div className="route-loading"><Spin size="large" /></div>;
  }
  if (error || !data) {
    return <Alert type="error" showIcon message={error ?? '分享链接不可用'} />;
  }
  return <DashboardView chart={data.chart} runtimeRows={data.runtimeRows} embed={embed} />;
}
