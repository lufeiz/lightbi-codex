import DOMPurify from 'dompurify';
import { Component } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { recordPerformanceMetric } from '@/features/charts/chartUtils';
import type { ChartWidget, DashboardFilters, DataRow } from '@/types/domain';

interface ChartRendererProps {
  widget: ChartWidget;
  rows?: DataRow[];
  filters?: DashboardFilters;
}

interface ChartRuntimeProps {
  widget: ChartWidget;
  rows: DataRow[];
}

interface G2Runtime {
  line: () => G2Runtime;
  interval: () => G2Runtime;
  render: () => void | Promise<unknown>;
  destroy: () => void;
}

interface G2Mark {
  data: (data: DataRow[]) => G2Mark;
  changeData?: (data: DataRow[]) => void | Promise<unknown>;
  encode: (key: string, value: string) => G2Mark;
  coordinate: (options: Record<string, unknown>) => G2Mark;
  transform: (options: Record<string, unknown>) => G2Mark;
  label: (options: Record<string, unknown>) => G2Mark;
  tooltip: (options: boolean | Record<string, unknown>) => G2Mark;
}

interface S2Runtime {
  setDataCfg?: (dataCfg: Record<string, unknown>, reset?: boolean) => void;
  setOptions?: (options: Record<string, unknown>, reset?: boolean) => void;
  render: (options?: unknown) => void | Promise<unknown>;
  destroy: () => void;
}

export function SafeChartRenderer(props: ChartRendererProps) {
  return (
    <ChartErrorBoundary widget={props.widget} rows={props.rows} filters={props.filters}>
      <ChartRenderer {...props} />
    </ChartErrorBoundary>
  );
}

export function ChartRenderer({ widget, rows, filters }: ChartRendererProps) {
  const visibilityRef = useRef<HTMLDivElement | null>(null);
  const visible = useInViewport(visibilityRef);
  const filteredRows = useMemo(() => applyDashboardFilters(widget, rows, filters), [filters, rows, widget]);

  if (isTextWidget(widget)) {
    return <TextRenderer widget={widget} />;
  }

  if (!filteredRows.length) {
    return <ChartPlaceholder widget={widget} />;
  }
  if (!visible) {
    return <div ref={visibilityRef}><ChartPlaceholder widget={widget} /></div>;
  }
  if (isMetricWidget(widget)) {
    return <div ref={visibilityRef}><MetricRenderer widget={widget} rows={filteredRows} /></div>;
  }
  if (isTableWidget(widget)) {
    return <div ref={visibilityRef}><S2Renderer widget={widget} rows={filteredRows} /></div>;
  }
  return <div ref={visibilityRef}><G2Renderer widget={widget} rows={filteredRows} /></div>;
}

interface ChartErrorBoundaryProps extends ChartRendererProps {
  children: ReactNode;
}

class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, { error: string | null }> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : '图表渲染失败' };
  }

  componentDidCatch(error: unknown) {
    console.error('chart render failed', error);
  }

  componentDidUpdate(prevProps: ChartErrorBoundaryProps) {
    if (this.state.error && chartRenderInputsChanged(prevProps, this.props)) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="chart-renderer chart-render-error">
          <div className="chart-title">{this.props.widget.config.title}</div>
          <div className="chart-render-error-body">
            <strong>图表渲染失败</strong>
            <span>{this.state.error}</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function chartRenderInputsChanged(prevProps: ChartErrorBoundaryProps, nextProps: ChartErrorBoundaryProps): boolean {
  return prevProps.widget !== nextProps.widget || prevProps.rows !== nextProps.rows || prevProps.filters !== nextProps.filters;
}

function G2Renderer({ widget, rows: rawRows }: ChartRuntimeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<G2Runtime | null>(null);
  const markRef = useRef<G2Mark | null>(null);
  const latestRowsRef = useRef(rawRows);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  latestRowsRef.current = rawRows;

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }
    let destroyed = false;
    runtimeRef.current = null;
    markRef.current = null;
    setRuntimeError(null);

    void import('@antv/g2').then(({ Chart }) => {
      if (!containerRef.current || destroyed) {
        return;
      }
      try {
        const renderStart = performance.now();
        const chart = new Chart({
          container: containerRef.current,
          autoFit: true
        });
        const runtime = chart as unknown as G2Runtime;
        runtimeRef.current = runtime;
        const renderConfig = buildG2RenderConfig(widget, latestRowsRef.current);

        let mark: G2Mark | null = null;
        if (widget.type === 'line') {
          mark = runtime.line() as unknown as G2Mark;
          mark.data(renderConfig.markData).encode('x', renderConfig.xField).encode('y', renderConfig.yField);
          if (renderConfig.colorField) {
            mark.encode('color', renderConfig.colorField);
          }
        }
        if (widget.type === 'column' || widget.type === 'stackedColumn' || widget.type === 'percentStackedColumn') {
          mark = runtime.interval() as unknown as G2Mark;
          mark.data(renderConfig.markData).encode('x', renderConfig.xField).encode('y', renderConfig.yField);
          if (renderConfig.colorField) {
            mark.encode('color', renderConfig.colorField);
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
            .data(renderConfig.markData)
            .coordinate({ transform: [{ type: 'transpose' }] })
            .encode('x', renderConfig.xField)
            .encode('y', renderConfig.yField);
          if (renderConfig.colorField) {
            mark.encode('color', renderConfig.colorField);
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
            .data(renderConfig.markData)
            .coordinate({ type: 'theta', outerRadius: 0.82, innerRadius: widget.type === 'donut' ? 0.58 : 0 })
            .transform({ type: 'stackY' })
            .encode('y', renderConfig.yField)
            .encode('color', renderConfig.xField);
        }

        if (mark) {
          mark.tooltip(widget.config.showTooltip ? { title: renderConfig.xField, items: renderConfig.tooltipFields } : false);
          if (widget.config.showLabel) {
            mark.label({ text: renderConfig.labelField, style: { fontSize: widget.config.labelSize ?? 12 } });
          }
        }
        markRef.current = mark;
        emitRendererLifecycle(widget, 'g2', 'init');
        recordRenderCompletion(runtime.render(), renderStart, (message) => {
          if (!destroyed) {
            setRuntimeError(message);
          }
        });
      } catch (err) {
        runtimeRef.current?.destroy();
        runtimeRef.current = null;
        markRef.current = null;
        if (!destroyed) {
          setRuntimeError(err instanceof Error ? err.message : 'G2 图表渲染失败');
        }
      }
    }).catch((err: unknown) => {
      if (!destroyed) {
        setRuntimeError(err instanceof Error ? err.message : 'G2 图表加载失败');
      }
    });

    return () => {
      destroyed = true;
      if (runtimeRef.current) {
        emitRendererLifecycle(widget, 'g2', 'destroy');
      }
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
      markRef.current = null;
    };
  }, [
    widget.config.dimensions,
    widget.config.fieldLabels,
    widget.config.labelField,
    widget.config.labelSize,
    widget.config.measures,
    widget.config.showLabel,
    widget.config.showTooltip,
    widget.type
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const mark = markRef.current;
    if (!runtime || !mark) {
      return;
    }
    const renderStart = performance.now();
    const renderConfig = buildG2RenderConfig(widget, rawRows);
    emitRendererLifecycle(widget, 'g2', 'update');
    if (mark.changeData) {
      recordRenderCompletion(mark.changeData(renderConfig.markData), renderStart, (message) => setRuntimeError(message));
      return;
    }
    mark.data(renderConfig.markData);
    recordRenderCompletion(runtime.render(), renderStart, (message) => setRuntimeError(message));
  }, [rawRows, widget, widget.config.dimensions, widget.config.fieldLabels, widget.config.measures, widget.type]);

  if (runtimeError) {
    return <ChartRenderError widget={widget} message={runtimeError} />;
  }

  return (
    <div className={`chart-renderer ${chartThemeClass(widget)}`}>
      <div className="chart-title" style={chartTitleStyle(widget)}>{widget.config.title}</div>
      <div ref={containerRef} className="chart-canvas" />
    </div>
  );
}

function S2Renderer({ widget, rows: rawRows }: ChartRuntimeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<S2Runtime | null>(null);
  const latestRowsRef = useRef(rawRows);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  latestRowsRef.current = rawRows;

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }
    let destroyed = false;
    sheetRef.current = null;
    setRuntimeError(null);

    void import('@antv/s2').then(({ PivotSheet, TableSheet }) => {
      if (!containerRef.current || destroyed) {
        return;
      }
      try {
        const renderStart = performance.now();
        const Sheet = widget.type === 'detailTable' ? TableSheet : PivotSheet;
        const sheet = new Sheet(containerRef.current, buildS2DataConfig(widget, latestRowsRef.current) as never, buildS2Options(widget) as never) as unknown as S2Runtime;
        sheetRef.current = sheet;
        emitRendererLifecycle(widget, 's2', 'init');
        recordRenderCompletion(sheet.render(), renderStart, (message) => {
          if (!destroyed) {
            setRuntimeError(message);
          }
        });
      } catch (err) {
        sheetRef.current?.destroy();
        sheetRef.current = null;
        if (!destroyed) {
          setRuntimeError(err instanceof Error ? err.message : 'S2 表格渲染失败');
        }
      }
    }).catch((err: unknown) => {
      if (!destroyed) {
        setRuntimeError(err instanceof Error ? err.message : 'S2 表格加载失败');
      }
    });

    return () => {
      destroyed = true;
      if (sheetRef.current) {
        emitRendererLifecycle(widget, 's2', 'destroy');
      }
      sheetRef.current?.destroy();
      sheetRef.current = null;
    };
  }, [widget.type]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }
    const renderStart = performance.now();
    sheet.setDataCfg?.(buildS2DataConfig(widget, rawRows), true);
    emitRendererLifecycle(widget, 's2', 'update');
    recordRenderCompletion(sheet.render(false), renderStart, (message) => setRuntimeError(message));
  }, [rawRows, widget, widget.config.dimensions, widget.config.fieldLabels, widget.config.measures, widget.type]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }
    const renderStart = performance.now();
    sheet.setOptions?.(buildS2Options(widget), false);
    emitRendererLifecycle(widget, 's2', 'update');
    recordRenderCompletion(sheet.render(false), renderStart, (message) => setRuntimeError(message));
  }, [widget.config.showScrollbar, widget.config.showTooltip, widget.height, widget.width]);

  if (runtimeError) {
    return <ChartRenderError widget={widget} message={runtimeError} />;
  }

  return (
    <div className={`chart-renderer ${chartThemeClass(widget)}`}>
      <div className="chart-title" style={chartTitleStyle(widget)}>{widget.config.title}</div>
      <div ref={containerRef} className="s2-canvas" />
    </div>
  );
}

function ChartRenderError({ widget, message }: { widget: ChartWidget; message: string }) {
  return (
    <div className="chart-renderer chart-render-error">
      <div className="chart-title" style={chartTitleStyle(widget)}>{widget.config.title}</div>
      <div className="chart-render-error-body">
        <strong>图表渲染失败</strong>
        <span>{message}</span>
      </div>
    </div>
  );
}

function TextRenderer({ widget }: Pick<ChartRendererProps, 'widget'>) {
  const contentHtml = DOMPurify.sanitize(widget.config.textHtml || escapeHtml(widget.config.textContent?.trim() || '输入文本内容'));

  return (
    <div className={`chart-renderer text-widget-renderer ${chartThemeClass(widget)}`}>
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
    <div className={`chart-renderer metric-renderer ${widget.type === 'metricTrendCard' ? 'metric-trend-renderer' : ''} ${chartThemeClass(widget)}`}>
      <div className="chart-title" style={chartTitleStyle(widget)}>{widget.config.title}</div>
      <div className="metric-card-body">
        <div>
          <div className="metric-label" style={{ fontSize: widget.config.labelSize ?? 12 }}>{measureField}</div>
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

function buildG2RenderConfig(widget: ChartWidget, rawRows: DataRow[]) {
  const rows = normalizedRows(widget, rawRows);
  const primaryDimension = widget.config.dimensions[0] ?? 'category';
  const seriesDimension = widget.config.dimensions[1];
  const xField = displayFieldName(widget, primaryDimension);
  const colorField = seriesDimension ? displayFieldName(widget, seriesDimension) : undefined;
  const yField = displayFieldName(widget, widget.config.measures[0] ?? 'value');
  const labelField = displayFieldName(widget, widget.config.labelField || widget.config.measures[0] || 'value');
  const markData = widget.type === 'pie' || widget.type === 'donut' ? collapseIntervalRows(rows, xField, yField) : collapseIntervalRows(rows, xField, yField, colorField);

  return {
    markData,
    xField,
    yField,
    colorField,
    labelField,
    tooltipFields: widget.config.measures.length ? widget.config.measures.map((field) => displayFieldName(widget, field)) : [yField]
  };
}

function buildS2DataConfig(widget: ChartWidget, rawRows: DataRow[]): Record<string, unknown> {
  const rows = normalizedRows(widget, rawRows);
  const dimensions = (widget.config.dimensions.length ? widget.config.dimensions : ['category']).map((field) => displayFieldName(widget, field));
  const configuredMeasures = widget.config.measures.map((field) => displayFieldName(widget, field));
  const measures = widget.type === 'detailTable' ? configuredMeasures : configuredMeasures.length ? configuredMeasures : ['value', 'lastYear'].map((field) => displayFieldName(widget, field));
  if (widget.type === 'detailTable') {
    return {
      fields: {
        columns: [...dimensions, ...measures]
      },
      data: rows
    };
  }
  return {
    fields: {
      rows: [dimensions[0]],
      columns: widget.type === 'comparisonTable' ? [dimensions[1] ?? dimensions[0]] : [dimensions[1] ?? displayFieldName(widget, 'month')],
      values: measures,
      valueInCols: true
    },
    data: rows
  };
}

function buildS2Options(widget: ChartWidget): Record<string, unknown> {
  return {
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
}

function recordRenderCompletion(result: void | Promise<unknown>, renderStart: number, onError: (message: string) => void) {
  recordPerformanceMetric('CHART_RENDER', performance.now() - renderStart);
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    void (result as Promise<unknown>)
      .catch((err: unknown) => onError(err instanceof Error ? err.message : '图表渲染失败'));
  }
}

function emitRendererLifecycle(widget: ChartWidget, renderer: 'g2' | 's2', action: 'init' | 'update' | 'destroy') {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent('lightbi:renderer-lifecycle', {
      detail: {
        widgetId: widget.id,
        chartType: widget.type,
        renderer,
        action,
        timestamp: Date.now()
      }
    })
  );
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

function useInViewport(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return visible;
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

function applyDashboardFilters(widget: ChartWidget, runtimeRows?: DataRow[], filters?: DashboardFilters): DataRow[] {
  const rows = runtimeRows?.length ? runtimeRows : (widget.config.previewRows ?? []);
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

function chartThemeClass(widget: ChartWidget): string {
  return `chart-theme-${widget.config.theme ?? 'default'}`;
}

function chartTitleStyle(widget: ChartWidget): { fontSize?: number } {
  return widget.config.labelSize ? { fontSize: Math.max(widget.config.labelSize + 2, 13) } : {};
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
    <div className={`chart-renderer ${chartThemeClass(widget)}`}>
      <div className="chart-title" style={chartTitleStyle(widget)}>{widget.config.title}</div>
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
