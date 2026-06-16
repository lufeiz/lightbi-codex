import { Button, Empty, Space, Tag, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DashboardFilterBar } from '@/features/charts/DashboardFilterBar';
import { SafeChartRenderer } from '@/features/charts/ChartRenderer';
import type { ChartWidget, DashboardFilters, DataRow, PublishedChartAsset, WidgetRuntimeStatus } from '@/types/domain';

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
  const canvasRef = useRef<HTMLElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));
  const baseWidth = Math.max(720, ...widgets.map((widget) => widget.x + widget.width + 32), 720);
  const baseHeight = Math.max(640, ...widgets.map((widget) => widget.y + widget.height + 32), 640);
  const isMobileLayout = viewportWidth > 0 && viewportWidth < 720;
  const scale = isMobileLayout ? 1 : Math.min(1, Math.max(0.5, (viewportWidth - 2) / baseWidth));
  const canvasStyle: CSSProperties = isMobileLayout
    ? {}
    : {
        height: Math.ceil(baseHeight * scale),
        minHeight: Math.ceil(baseHeight * scale)
      };
  const stageStyle: CSSProperties = {
    width: Math.ceil(baseWidth * scale),
    height: Math.ceil(baseHeight * scale)
  };
  const layerStyle: CSSProperties = {
    width: baseWidth,
    height: baseHeight,
    transform: `scale(${scale})`
  };
  const hasViewerFilters = viewerFilters.timeFilter.enabled || viewerFilters.dimensionControls.length > 0;
  const activeFilterLabels = activeViewerFilterLabels(viewerFilters);
  const refreshedAt = latestRuntimeExecutedAt(runtimeStatus);

  useEffect(() => {
    setViewerFilters(initialFilters);
  }, [initialFilters]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) {
      return undefined;
    }
    const updateViewportWidth = () => setViewportWidth(Math.min(node.clientWidth || window.innerWidth, window.innerWidth));
    updateViewportWidth();
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(node);
    window.addEventListener('resize', updateViewportWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateViewportWidth);
    };
  }, []);

  const renderWidget = (widget: ChartWidget, mobile = false) => {
    const status = runtimeStatus[widget.id];
    return (
      <article
        key={widget.id}
        className={mobile ? 'published-widget published-widget-mobile' : 'published-widget'}
        style={mobile ? { minHeight: Math.max(widget.height, 220) } : { left: widget.x, top: widget.y, width: widget.width, height: widget.height }}
      >
        <SafeChartRenderer widget={widget} rows={runtimeRows[widget.id]} filters={viewerFilters} />
        {status && status.status !== 'success' && <RuntimeStatusBadge status={status} />}
      </article>
    );
  };

  return (
    <div className={embed ? 'published-dashboard embed' : 'published-dashboard'}>
      {!embed && (
        <header className="published-dashboard-header">
          <div>
            <Typography.Title level={3}>{chart.name}</Typography.Title>
            <Typography.Text type="secondary">{chart.description || '已发布仪表盘'}</Typography.Text>
            <Space className="published-dashboard-meta" size={[12, 4]} wrap>
              <Typography.Text type="secondary">刷新时间 {formatDateTime(refreshedAt)}</Typography.Text>
              <Typography.Text type="secondary">组件 {widgets.length}</Typography.Text>
            </Space>
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
      <section
        ref={canvasRef}
        className={isMobileLayout ? 'published-dashboard-canvas published-dashboard-canvas-mobile' : 'published-dashboard-canvas'}
        style={canvasStyle}
      >
        {widgets.length === 0 && <Empty description="暂无图表" />}
        {widgets.length > 0 && isMobileLayout && <div className="published-dashboard-mobile-list">{widgets.map((widget) => renderWidget(widget, true))}</div>}
        {widgets.length > 0 && !isMobileLayout && (
          <div className="published-dashboard-stage" style={stageStyle}>
            <div className="published-dashboard-layer" style={layerStyle}>
              {widgets.map((widget) => renderWidget(widget))}
            </div>
          </div>
        )}
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

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN');
}

function latestRuntimeExecutedAt(statuses: Record<string, WidgetRuntimeStatus>): string | null {
  const timestamps = Object.values(statuses)
    .map((status) => (status.executedAt ? Date.parse(status.executedAt) : NaN))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) {
    return null;
  }
  return new Date(Math.max(...timestamps)).toISOString();
}

function RuntimeStatusBadge({ status }: { status: WidgetRuntimeStatus }) {
  return (
    <div className={`published-widget-runtime-status status-${status.status}`}>
      <span>{status.message}</span>
      {status.status === 'error' && status.errorCode && <small>{status.errorCode}</small>}
    </div>
  );
}
