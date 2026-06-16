import { Alert, Button, Spin, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '@/api/client';
import { DashboardView } from '@/features/charts/DashboardView';
import type { PublishedDashboard } from '@/types/domain';

export function PublishedDashboardPage() {
  const params = useParams();
  const chartId = Number(params.id);
  const [data, setData] = useState<PublishedDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .publishedDashboard(chartId)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载已发布仪表盘失败'))
      .finally(() => setLoading(false));
  }, [chartId]);

  if (loading) {
    return <div className="route-loading"><Spin size="large" /></div>;
  }

  if (error || !data) {
    return <Alert type="error" showIcon message={error ?? '仪表盘不存在'} />;
  }

  return (
    <main className="published-page">
      <Space className="published-page-actions">
        <Typography.Text type="secondary">版本 {data.version?.version ?? '-'}</Typography.Text>
        <Link to={`/dashboards/${data.chart.id}/edit`}>
          <Button>编辑</Button>
        </Link>
      </Space>
      <DashboardView chart={data.chart} runtimeRows={data.runtimeRows} runtimeStatus={data.runtimeStatus} />
    </main>
  );
}
