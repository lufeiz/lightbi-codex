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

  if (widget.type === 'text') {
    return <TextRenderer widget={widget} />;
  }

  if (!filteredRows.length) {
    return <ChartPlaceholder widget={widget} />;
  }
  if (widget.type === 'detailTable' || widget.type === 'pivotTable' || widget.type === 'comparisonTable') {
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
    if (widget.type === 'column') {
      mark = runtime.interval() as unknown as G2Mark;
      mark.data(intervalRows).encode('x', xField).encode('y', yField);
      if (colorField) {
        mark.encode('color', colorField);
      }
    }
    if (widget.type === 'bar') {
      mark = runtime.interval() as unknown as G2Mark;
      mark
        .data(intervalRows)
        .coordinate({ transform: [{ type: 'transpose' }] })
        .encode('x', xField)
        .encode('y', yField);
      if (colorField) {
        mark.encode('color', colorField);
      }
    }
    if (widget.type === 'pie') {
      mark = runtime.interval() as unknown as G2Mark;
      mark
        .data(rows)
        .coordinate({ type: 'theta', outerRadius: 0.82 })
        .transform({ type: 'stackY' })
        .encode('y', yField)
        .encode('color', colorField ?? xField);
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

function normalizedRows(widget: ChartWidget, rows: DataRow[]): DataRow[] {
  return rows.map((row) => {
    const next: DataRow = {};
    Object.entries(row).forEach(([key, value]) => {
      next[displayFieldName(widget, key)] = value;
    });
    return next;
  });
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
  if (!filters || widget.type === 'text') {
    return rows;
  }

  let nextRows = rows;
  const widgetDimensionFilters = filters.chartDimensionFilters[widget.id] ?? [];
  widgetDimensionFilters.forEach((filter) => {
    if (!filter.values.length || !hasField(nextRows, filter.field)) {
      return;
    }
    const allowedValues = new Set(filter.values);
    nextRows = nextRows.filter((row) => allowedValues.has(String(row[filter.field] ?? '')));
  });

  if (filters.timeRange) {
    const timeField = findTimeField(widget, nextRows);
    if (timeField) {
      nextRows = nextRows.filter((row) => valueInTimeRange(row[timeField], filters.timeRange as [string, string]));
    }
  }

  return nextRows;
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
  const isTable = widget.type === 'detailTable' || widget.type === 'pivotTable' || widget.type === 'comparisonTable';
  const isPie = widget.type === 'pie';
  const isLine = widget.type === 'line';

  return (
    <div className="chart-renderer">
      <div className="chart-title">{widget.config.title}</div>
      <div className={`chart-placeholder ${isTable ? 'table' : isPie ? 'pie' : isLine ? 'line' : 'bar'}`}>
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
        {isLine && <div className="placeholder-line" />}
        {!isTable && !isPie && !isLine && (
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
