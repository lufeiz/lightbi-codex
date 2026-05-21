import { Chart as G2Chart } from '@antv/g2';
import { PivotSheet, TableSheet } from '@antv/s2';
import { useEffect, useMemo, useRef } from 'react';

import type { ChartWidget, DashboardFilters, DataRow } from '@/types/domain';

interface ChartRendererProps {
  widget: ChartWidget;
  filters?: DashboardFilters;
}

interface ChartRuntimeProps {
  widget: ChartWidget;
  rows: DataRow[];
}

interface G2Runtime {
  line: () => G2Runtime;
  interval: () => G2Runtime;
  render: () => void;
  destroy: () => void;
}

interface G2Mark {
  data: (data: DataRow[]) => G2Mark;
  encode: (key: string, value: string) => G2Mark;
  coordinate: (options: Record<string, unknown>) => G2Mark;
  transform: (options: Record<string, unknown>) => G2Mark;
  label: (options: Record<string, unknown>) => G2Mark;
  tooltip: (options: boolean | Record<string, unknown>) => G2Mark;
}

export function ChartRenderer({ widget, filters }: ChartRendererProps) {
  const filteredRows = useMemo(() => applyDashboardFilters(widget, filters), [filters, widget]);

  if (isTextWidget(widget)) {
    return <TextRenderer widget={widget} />;
  }

  if (!filteredRows.length) {
    return <ChartPlaceholder widget={widget} />;
  }
  if (isMetricWidget(widget)) {
    return <MetricRenderer widget={widget} rows={filteredRows} />;
  }
  if (isTableWidget(widget)) {
    return <S2Renderer widget={widget} rows={filteredRows} />;
  }
  return <G2Renderer widget={widget} rows={filteredRows} />;
}

function G2Renderer({ widget, rows: rawRows }: ChartRuntimeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const chart = new G2Chart({
      container: containerRef.current,
      autoFit: true
    });
    const runtime = chart as unknown as G2Runtime;
    const rows = normalizedRows(widget, rawRows);
    const primaryDimension = widget.config.dimensions[0] ?? 'category';
    const seriesDimension = widget.config.dimensions[1];
    const xField = displayFieldName(widget, primaryDimension);
    const colorField = seriesDimension ? displayFieldName(widget, seriesDimension) : undefined;
    const yField = displayFieldName(widget, widget.config.measures[0] ?? 'value');
    const labelField = displayFieldName(widget, widget.config.labelField || widget.config.measures[0] || 'value');
    const intervalRows = collapseIntervalRows(rows, xField, yField, colorField);

    let mark: G2Mark | null = null;
    if (widget.type === 'line') {
      mark = runtime.line() as unknown as G2Mark;
      mark.data(intervalRows).encode('x', xField).encode('y', yField);
      if (colorField) {
        mark.encode('color', colorField);
      }
    }
    if (widget.type === 'column' || widget.type === 'stackedColumn' || widget.type === 'percentStackedColumn') {
      mark = runtime.interval() as unknown as G2Mark;
      mark.data(intervalRows).encode('x', xField).encode('y', yField);
      if (colorField) {
        mark.encode('color', colorField);
      }
      if (widget.type === 'stackedColumn' || widget.type === 'percentStackedColumn') {
        mark.transform({ type: 'stackY' });
      }
      if (widget.type === 'percentStackedColumn') {
        mark.transform({ type: 'normalizeY' });
      }
    }
    if (widget.type === 'bar' || widget.type === 'stackedBar' || widget.type === 'percentStackedBar') {
      mark = runtime.interval() as unknown as G2Mark;
      mark
        .data(intervalRows)
        .coordinate({ transform: [{ type: 'transpose' }] })
        .encode('x', xField)
        .encode('y', yField);
      if (colorField) {
        mark.encode('color', colorField);
      }
      if (widget.type === 'stackedBar' || widget.type === 'percentStackedBar') {
        mark.transform({ type: 'stackY' });
      }
      if (widget.type === 'percentStackedBar') {
        mark.transform({ type: 'normalizeY' });
      }
    }
    if (widget.type === 'pie' || widget.type === 'donut') {
      mark = runtime.interval() as unknown as G2Mark;
      mark
        .data(collapseIntervalRows(rows, xField, yField))
        .coordinate({ type: 'theta', outerRadius: 0.82, innerRadius: widget.type === 'donut' ? 0.58 : 0 })
        .transform({ type: 'stackY' })
        .encode('y', yField)
        .encode('color', xField);
    }

    if (mark) {
      mark.tooltip(widget.config.showTooltip ? { title: xField, items: widget.config.measures.length ? widget.config.measures.map((field) => displayFieldName(widget, field)) : [yField] } : false);
      if (widget.config.showLabel) {
        mark.label({ text: labelField });
      }
    }
    runtime.render();

    return () => {
      runtime.destroy();
    };
  }, [
    widget.config.dimensions,
    widget.config.fieldLabels,
    widget.config.labelField,
    widget.config.measures,
    widget.config.showLabel,
    widget.config.showTooltip,
    widget.height,
    rawRows,
    widget.type,
    widget.width
  ]);

  return (
    <div className="chart-renderer">
      <div className="chart-title">{widget.config.title}</div>
      <div ref={containerRef} className="chart-canvas" />
    </div>
  );
}

function S2Renderer({ widget, rows: rawRows }: ChartRuntimeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const rows = normalizedRows(widget, rawRows);
    const dimensions = (widget.config.dimensions.length ? widget.config.dimensions : ['category']).map((field) => displayFieldName(widget, field));
    const measures = (widget.config.measures.length ? widget.config.measures : ['value', 'lastYear']).map((field) => displayFieldName(widget, field));
    const dataCfg =
      widget.type === 'detailTable'
        ? {
            fields: {
              columns: [...dimensions, ...measures]
            },
            data: rows
          }
        : {
            fields: {
              rows: [dimensions[0]],
              columns: widget.type === 'comparisonTable' ? [dimensions[1] ?? dimensions[0]] : [dimensions[1] ?? displayFieldName(widget, 'month')],
              values: measures,
              valueInCols: true
            },
            data: rows
          };

    const options: Record<string, unknown> = {
      width: Math.max(widget.width - 32, 280),
      height: Math.max(widget.height - 60, 200),
      tooltip: { showTooltip: widget.config.showTooltip },
      interaction: { hoverHighlight: true },
      style: {
        cellCfg: {
          height: 34
        }
      },
      showDefaultHeaderActionIcon: false,
      frozen: widget.config.showScrollbar ? { rowHeader: true } : undefined
    };

    const Sheet = widget.type === 'detailTable' ? TableSheet : PivotSheet;
    const sheet = new Sheet(containerRef.current, dataCfg, options as never);
    sheet.render();

    return () => {
      sheet.destroy();
    };
  }, [
    widget.config.dimensions,
    widget.config.fieldLabels,
    widget.config.measures,
    widget.config.showScrollbar,
    widget.config.showTooltip,
    widget.height,
    rawRows,
    widget.type,
    widget.width
  ]);

  return (
    <div className="chart-renderer">
      <div className="chart-title">{widget.config.title}</div>
      <div ref={containerRef} className="s2-canvas" />
    </div>
  );
}

function TextRenderer({ widget }: Pick<ChartRendererProps, 'widget'>) {
  const contentHtml = widget.config.textHtml || escapeHtml(widget.config.textContent?.trim() || '输入文本内容');

  return (
    <div className="chart-renderer text-widget-renderer">
      <div className="text-widget-content" dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </div>
  );
}

function MetricRenderer({ widget, rows: rawRows }: ChartRuntimeProps) {
  const rows = normalizedRows(widget, rawRows);
  const dimensionField = displayFieldName(widget, widget.config.dimensions[0] ?? 'category');
  const measureField = displayFieldName(widget, widget.config.measures[0] ?? 'value');
  const compareField = widget.config.measures[1] ? displayFieldName(widget, widget.config.measures[1]) : undefined;
  const value = sumNumericField(rows, measureField);
  const compareValue = compareField ? sumNumericField(rows, compareField) : null;
  const trendPoints = buildTrendPoints(rows, dimensionField, measureField);
  const delta = compareValue && compareValue !== 0 ? ((value - compareValue) / Math.abs(compareValue)) * 100 : null;

  return (
    <div className={`chart-renderer metric-renderer ${widget.type === 'metricTrendCard' ? 'metric-trend-renderer' : ''}`}>
      <div className="chart-title">{widget.config.title}</div>
      <div className="metric-card-body">
        <div>
          <div className="metric-label">{measureField}</div>
          <div className="metric-value">{formatMetricValue(value)}</div>
          {delta !== null && <div className={`metric-delta ${delta >= 0 ? 'positive' : 'negative'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}%</div>}
        </div>
        {widget.type === 'metricTrendCard' && <MetricTrendSvg points={trendPoints} />}
      </div>
    </div>
  );
}

function MetricTrendSvg({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="metric-trend-empty">暂无趋势</div>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 120;
      const y = 52 - ((value - min) / range) * 44;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="metric-trend-svg" viewBox="0 0 120 60" role="img" aria-label="指标趋势">
      <path d={path} fill="none" stroke="#1677ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`${path} L120 58 L0 58 Z`} fill="rgba(22, 119, 255, 0.1)" stroke="none" />
    </svg>
  );
}

function normalizedRows(widget: ChartWidget, rows: DataRow[]): DataRow[] {
  return rows.map((row) => {
    const next: DataRow = {};
    Object.entries(row).forEach(([key, value]) => {
      next[displayFieldName(widget, key)] = value;
    });
    return next;
  });
}

function isTextWidget(widget: ChartWidget): boolean {
  return widget.type === 'text' || widget.type === 'richText';
}

function isTableWidget(widget: ChartWidget): boolean {
  return widget.type === 'detailTable' || widget.type === 'pivotTable' || widget.type === 'comparisonTable';
}

function isMetricWidget(widget: ChartWidget): boolean {
  return widget.type === 'metricCard' || widget.type === 'metricTrendCard';
}

function sumNumericField(rows: DataRow[], field: string): number {
  return rows.reduce((sum, row) => {
    const value = row[field];
    return typeof value === 'number' ? sum + value : sum;
  }, 0);
}

function buildTrendPoints(rows: DataRow[], dimensionField: string, measureField: string): number[] {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(row[dimensionField] ?? '');
    const value = row[measureField];
    if (typeof value !== 'number') {
      return;
    }
    grouped.set(key, (grouped.get(key) ?? 0) + value);
  });
  return [...grouped.values()].slice(0, 12);
}

function formatMetricValue(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value);
}

function collapseIntervalRows(rows: DataRow[], xField: string, yField: string, colorField?: string): DataRow[] {
  const groupKeys = [xField, colorField].filter(Boolean) as string[];
  const grouped = new Map<string, DataRow>();

  rows.forEach((row) => {
    const key = groupKeys.map((field) => String(row[field] ?? '')).join('__');
    const current = grouped.get(key);
    const yValue = row[yField];
    if (!current) {
      grouped.set(key, { ...row });
      return;
    }
    const currentValue = current[yField];
    if (typeof currentValue === 'number' && typeof yValue === 'number') {
      current[yField] = currentValue + yValue;
    }
  });

  return [...grouped.values()];
}

function applyDashboardFilters(widget: ChartWidget, filters?: DashboardFilters): DataRow[] {
  const rows = widget.config.previewRows ?? [];
  if (!filters || isTextWidget(widget)) {
    return rows;
  }

  let nextRows = rows;
  const widgetDimensionFilters = filters.dimensionControls.filter((control) => dimensionFilterAppliesToWidget(control, widget));
  widgetDimensionFilters.forEach((filter) => {
    const field = resolveDimensionFilterField(widget, filter);
    if (!field || !filter.values.length || !hasField(nextRows, field)) {
      return;
    }
    const allowedValues = new Set(filter.values);
    nextRows = nextRows.filter((row) => allowedValues.has(String(row[field] ?? '')));
  });

  const timeFilterEnabled = Boolean(filters.timeFilter.enabled || filters.timeFilter.range);
  if (timeFilterEnabled && (!filters.timeFilter.chartId || filters.timeFilter.chartId === widget.id) && filters.timeFilter.range) {
    const timeField = findTimeField(widget, nextRows);
    if (timeField) {
      nextRows = nextRows.filter((row) => valueInTimeRange(row[timeField], filters.timeFilter.range as [string, string]));
    }
  }

  return nextRows;
}

function dimensionFilterAppliesToWidget(filter: DashboardFilters['dimensionControls'][number], widget: ChartWidget): boolean {
  if (filter.chartIds?.length) {
    return filter.chartIds.includes(widget.id);
  }
  if (filter.chartId) {
    return filter.chartId === widget.id;
  }
  return Boolean(filter.field);
}

function resolveDimensionFilterField(widget: ChartWidget, filter: DashboardFilters['dimensionControls'][number]): string {
  if (filter.fieldsByChart?.[widget.id]) {
    return filter.fieldsByChart[widget.id];
  }
  if (filter.field && widget.config.dimensions.includes(filter.field)) {
    return filter.field;
  }

  const label = filter.label.trim();
  const matchedDimension = widget.config.dimensions.find((field) => {
    const fieldLabel = displayFieldName(widget, field);
    return !isTimeField(widget, field) && (fieldLabel === label || field === label);
  });

  return matchedDimension ?? '';
}

function hasField(rows: DataRow[], field: string): boolean {
  return rows.some((row) => Object.prototype.hasOwnProperty.call(row, field));
}

function findTimeField(widget: ChartWidget, rows: DataRow[]): string | undefined {
  const configuredFields = widget.config.dimensions.filter((field) => isTimeField(widget, field));
  if (configuredFields.length) {
    return configuredFields[0];
  }
  return Object.keys(rows[0] ?? {}).find((field) => isTimeField(widget, field));
}

function isTimeField(widget: ChartWidget, field: string): boolean {
  const label = displayFieldName(widget, field);
  return /date|time|month|year|day|dt/i.test(field) || /时间|日期|月份|年月|年份|年|月|日/.test(label);
}

function valueInTimeRange(value: DataRow[string], range: [string, string]): boolean {
  const startDate = new Date(range[0]);
  const endDate = new Date(range[1]);
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return true;
  }

  const valueTime = parseTimeValue(value, startDate.getFullYear());
  if (valueTime === null) {
    return true;
  }
  return valueTime >= startTime && valueTime <= endTime;
}

function parseTimeValue(value: DataRow[string], fallbackYear: number): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    if (value >= 1 && value <= 12) {
      return new Date(fallbackYear, value - 1, 1).getTime();
    }
    return value > 10000 ? value : null;
  }

  const text = String(value).trim();
  const chineseDate = text.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/);
  if (chineseDate) {
    return new Date(Number(chineseDate[1]), Number(chineseDate[2]) - 1, Number(chineseDate[3] ?? 1)).getTime();
  }

  const month = text.match(/^(\d{1,2})月$/);
  if (month) {
    return new Date(fallbackYear, Number(month[1]) - 1, 1).getTime();
  }

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return null;
}

const defaultFieldLabels: Record<string, string> = {
  category: '业务域',
  region: '区域',
  month: '月份',
  product: '产品线',
  value: '销售额',
  lastYear: '去年同期',
  profit: '利润',
  orders: '订单数'
};

function displayFieldName(widget: ChartWidget, field: string): string {
  return widget.config.fieldLabels?.[field] ?? defaultFieldLabels[field] ?? field;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('\n', '<br />');
}

function ChartPlaceholder({ widget }: ChartRendererProps) {
  const isTable = isTableWidget(widget);
  const isMetric = isMetricWidget(widget);
  const isPie = widget.type === 'pie' || widget.type === 'donut';
  const isLine = widget.type === 'line';

  return (
    <div className="chart-renderer">
      <div className="chart-title">{widget.config.title}</div>
      <div className={`chart-placeholder ${isTable ? 'table' : isMetric ? 'metric' : isPie ? 'pie' : isLine ? 'line' : 'bar'}`}>
        {isTable && (
          <>
            <div className="placeholder-table-head" />
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="placeholder-table-row">
                <span />
                <span />
                <span />
              </div>
            ))}
          </>
        )}
        {isPie && <div className="placeholder-pie" />}
        {isMetric && (
          <div className="placeholder-metric-card">
            <span />
            <strong />
            <em />
          </div>
        )}
        {isLine && <div className="placeholder-line" />}
        {!isTable && !isMetric && !isPie && !isLine && (
          <div className="placeholder-bars">
            {[46, 74, 58, 88, 66].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
        )}
        <div className="placeholder-caption">配置数据源后点击更新图表</div>
      </div>
    </div>
  );
}
