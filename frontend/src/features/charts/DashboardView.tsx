import { Empty, Typography } from 'antd';

import { ChartRenderer } from '@/features/charts/ChartRenderer';
import type { ChartAsset, DataRow } from '@/types/domain';

interface DashboardViewProps {
  chart: ChartAsset;
  runtimeRows?: Record<string, DataRow[]>;
  embed?: boolean;
}

export function DashboardView({ chart, runtimeRows = {}, embed = false }: DashboardViewProps) {
  const widgets = chart.config.widgets ?? [];
  const width = Math.max(960, ...widgets.map((widget) => widget.x + widget.width + 32), 960);
  const height = Math.max(640, ...widgets.map((widget) => widget.y + widget.height + 32), 640);

  return (
    <div className={embed ? 'published-dashboard embed' : 'published-dashboard'}>
      {!embed && (
        <header className="published-dashboard-header">
          <div>
            <Typography.Title level={3}>{chart.name}</Typography.Title>
            <Typography.Text type="secondary">{chart.description || '已发布仪表盘'}</Typography.Text>
          </div>
        </header>
      )}
      <section className="published-dashboard-canvas" style={{ width, minHeight: height }}>
        {widgets.length === 0 && <Empty description="暂无图表" />}
        {widgets.map((widget) => (
          <article key={widget.id} className="published-widget" style={{ left: widget.x, top: widget.y, width: widget.width, height: widget.height }}>
            <ChartRenderer widget={widget} rows={runtimeRows[widget.id]} filters={chart.config.filters} />
          </article>
        ))}
      </section>
    </div>
  );
}
