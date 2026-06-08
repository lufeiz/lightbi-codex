import { Button, Empty, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { DashboardFilterBar } from '@/features/charts/DashboardFilterBar';
import { SafeChartRenderer } from '@/features/charts/ChartRenderer';
import type { DashboardFilters, DataRow, PublishedChartAsset, WidgetRuntimeStatus } from '@/types/domain';

interface DashboardViewProps {
  chart: PublishedChartAsset;
  runtimeRows?: Record<string, DataRow[]>;
  runtimeStatus?: Record<string, WidgetRuntimeStatus>;
  embed?: boolean;
}

export function DashboardView({ chart, runtimeRows = {}, runtimeStatus = {}, embed = false }: DashboardViewProps) {
  const widgets = chart.config.widgets ?? [];
  const initialFilters = useMemo(() => normalizeViewerFilters(chart.config.filters), [chart.config.filters]);
  const [viewerFilters, setViewerFilters] = useState<DashboardFilters>(initialFilters);
  const width = Math.max(720, ...widgets.map((widget) => widget.x + widget.width + 32), 720);
  const height = Math.max(640, ...widgets.map((widget) => widget.y + widget.height + 32), 640);
  const hasViewerFilters = viewerFilters.timeFilter.enabled || viewerFilters.dimensionControls.length > 0;
  const activeFilterLabels = activeViewerFilterLabels(viewerFilters);

  useEffect(() => {
    setViewerFilters(initialFilters);
  }, [initialFilters]);

  return (
    <div className={embed ? 'published-dashboard embed' : 'published-dashboard'}>
      {!embed && (
        <header className="published-dashboard-header">
          <div>
            <Typography.Title level={3}>{chart.name}</Typography.Title>
            <Typography.Text type="secondary">{chart.description || '已发布仪表盘'}</Typography.Text>
          </div>
          {hasViewerFilters && (
            <Button onClick={() => setViewerFilters(clearViewerFilterValues(viewerFilters))}>
              清除筛选
            </Button>
          )}
        </header>
      )}
      {hasViewerFilters && (
        <section className="published-dashboard-filter-bar">
          <DashboardFilterBar
            compact
            allowConfigure={false}
            widgets={widgets}
            runtimeRows={runtimeRows}
            filters={viewerFilters}
            onFiltersChange={(patch) => setViewerFilters((current) => ({ ...current, ...patch }))}
          />
          {activeFilterLabels.length > 0 && (
            <Space className="published-dashboard-filter-summary" size={[6, 6]} wrap>
              {activeFilterLabels.map((label) => (
                <Tag key={label}>{label}</Tag>
              ))}
            </Space>
          )}
        </section>
      )}
      <section className="published-dashboard-canvas" style={{ width, minHeight: height }}>
        {widgets.length === 0 && <Empty description="暂无图表" />}
        {widgets.map((widget) => {
          const status = runtimeStatus[widget.id];
          return (
            <article key={widget.id} className="published-widget" style={{ left: widget.x, top: widget.y, width: widget.width, height: widget.height }}>
              <SafeChartRenderer widget={widget} rows={runtimeRows[widget.id]} filters={viewerFilters} />
              {status && status.status !== 'success' && (
                <RuntimeStatusBadge status={status} />
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function normalizeViewerFilters(filters: DashboardFilters | undefined): DashboardFilters {
  return {
    timeFilter: {
      label: filters?.timeFilter?.label || '日期',
      chartId: filters?.timeFilter?.chartId,
      enabled: Boolean(filters?.timeFilter?.enabled || filters?.timeFilter?.range),
      range: filters?.timeFilter?.range ?? null
    },
    dimensionControls: (filters?.dimensionControls ?? []).map((control) => ({
      ...control,
      values: control.values ?? []
    }))
  };
}

function clearViewerFilterValues(filters: DashboardFilters): DashboardFilters {
  return {
    timeFilter: {
      ...filters.timeFilter,
      range: null
    },
    dimensionControls: filters.dimensionControls.map((control) => ({ ...control, values: [] }))
  };
}

function activeViewerFilterLabels(filters: DashboardFilters): string[] {
  const labels: string[] = [];
  if (filters.timeFilter.range) {
    labels.push(`${filters.timeFilter.label || '日期'}：${formatDate(filters.timeFilter.range[0])} - ${formatDate(filters.timeFilter.range[1])}`);
  }
  filters.dimensionControls.forEach((control) => {
    if (control.values.length > 0) {
      labels.push(`${control.label || '维度'}：${control.values.join('、')}`);
    }
  });
  return labels;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('zh-CN');
}

function RuntimeStatusBadge({ status }: { status: WidgetRuntimeStatus }) {
  return (
    <div className={`published-widget-runtime-status status-${status.status}`}>
      <span>{status.message}</span>
      {status.status === 'error' && status.errorCode && <small>{status.errorCode}</small>}
    </div>
  );
}
