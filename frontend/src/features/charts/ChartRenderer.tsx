import { Chart as G2Chart } from '@antv/g2';
import { PivotSheet, TableSheet } from '@antv/s2';
import { useEffect, useRef } from 'react';

import { sampleRows } from '@/features/charts/chartUtils';
import type { ChartWidget, DataRow } from '@/types/domain';

interface ChartRendererProps {
  widget: ChartWidget;
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

export function ChartRenderer({ widget }: ChartRendererProps) {
  if (widget.type === 'detailTable' || widget.type === 'pivotTable' || widget.type === 'comparisonTable') {
    return <S2Renderer widget={widget} />;
  }
  return <G2Renderer widget={widget} />;
}

function G2Renderer({ widget }: ChartRendererProps) {
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
    const rows = normalizedRows(widget);
    const xField = widget.config.dimensions[0] ?? 'category';
    const colorField = widget.config.dimensions[1] ?? widget.config.dimensions[0] ?? 'category';
    const yField = widget.config.measures[0] ?? 'value';

    let mark: G2Mark | null = null;
    if (widget.type === 'line') {
      mark = runtime.line() as unknown as G2Mark;
      mark.data(rows).encode('x', xField).encode('y', yField).encode('color', colorField);
    }
    if (widget.type === 'column') {
      mark = runtime.interval() as unknown as G2Mark;
      mark.data(rows).encode('x', xField).encode('y', yField).encode('color', colorField);
    }
    if (widget.type === 'bar') {
      mark = runtime.interval() as unknown as G2Mark;
      mark
        .data(rows)
        .coordinate({ transform: [{ type: 'transpose' }] })
        .encode('x', xField)
        .encode('y', yField)
        .encode('color', colorField);
    }
    if (widget.type === 'pie') {
      mark = runtime.interval() as unknown as G2Mark;
      mark
        .data(rows)
        .coordinate({ type: 'theta', outerRadius: 0.82 })
        .transform({ type: 'stackY' })
        .encode('y', yField)
        .encode('color', colorField);
    }

    if (mark) {
      mark.tooltip(widget.config.showTooltip ? { title: xField, items: widget.config.measures.length ? widget.config.measures : [yField] } : false);
      if (widget.config.showLabel) {
        mark.label({ text: widget.config.labelField || yField });
      }
    }
    runtime.render();

    return () => {
      runtime.destroy();
    };
  }, [widget.config.dimensions, widget.config.labelField, widget.config.measures, widget.config.previewRows, widget.config.showLabel, widget.config.showTooltip, widget.type]);

  return (
    <div className="chart-renderer">
      <div className="chart-title">{widget.config.title}</div>
      <div ref={containerRef} className="chart-canvas" />
    </div>
  );
}

function S2Renderer({ widget }: ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const rows = normalizedRows(widget);
    const dimensions = widget.config.dimensions.length ? widget.config.dimensions : ['category'];
    const measures = widget.config.measures.length ? widget.config.measures : ['value', 'lastYear'];
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
              columns: widget.type === 'comparisonTable' ? [dimensions[1] ?? dimensions[0]] : [dimensions[1] ?? 'month'],
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
  }, [widget.config.dimensions, widget.config.measures, widget.config.previewRows, widget.config.showScrollbar, widget.config.showTooltip, widget.height, widget.type, widget.width]);

  return (
    <div className="chart-renderer">
      <div className="chart-title">{widget.config.title}</div>
      <div ref={containerRef} className="s2-canvas" />
    </div>
  );
}

function normalizedRows(widget: ChartWidget): DataRow[] {
  return widget.config.previewRows?.length ? widget.config.previewRows : sampleRows;
}
