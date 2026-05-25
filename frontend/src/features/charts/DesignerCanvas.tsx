import { Empty } from 'antd';
import type { PointerEvent } from 'react';
import { useEffect, useRef } from 'react';

import { SafeChartRenderer } from '@/features/charts/ChartRenderer';
import { recordPerformanceMetric } from '@/features/charts/chartUtils';
import { useDesignerStore } from '@/store/designerStore';
import type { ChartWidget } from '@/types/domain';

const MIN_WIDTH = 280;
const MIN_HEIGHT = 220;
const TEXT_MIN_WIDTH = 220;
const TEXT_MIN_HEIGHT = 120;

export function DesignerCanvas() {
  const x6Ref = useRef<HTMLDivElement | null>(null);
  const widgets = useDesignerStore((state) => state.widgets);
  const runtimeRows = useDesignerStore((state) => state.runtimeRows);
  const filters = useDesignerStore((state) => state.filters);
  const selectedWidgetId = useDesignerStore((state) => state.selectedWidgetId);
  const selectWidget = useDesignerStore((state) => state.selectWidget);
  const deleteWidget = useDesignerStore((state) => state.deleteWidget);
  const updateWidget = useDesignerStore((state) => state.updateWidget);

  useEffect(() => {
    if (!x6Ref.current) {
      return undefined;
    }
    let disposed = false;
    let graph: { dispose: () => void } | null = null;
    const container = x6Ref.current;

    void import('@antv/x6').then(({ Graph }) => {
      if (disposed) {
        return;
      }
      graph = new Graph({
        container,
        grid: {
          size: 16,
          visible: true,
          type: 'mesh',
          args: { color: '#d7dce5', thickness: 1 }
        },
        interacting: false,
        panning: true,
        mousewheel: {
          enabled: true,
          modifiers: ['ctrl', 'meta']
        }
      });
    });

    return () => {
      disposed = true;
      graph?.dispose();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedWidgetId || (event.key !== 'Backspace' && event.key !== 'Delete') || isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      deleteWidget(selectedWidgetId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [deleteWidget, selectedWidgetId]);

  const startDrag = (event: PointerEvent<HTMLDivElement>, widget: ChartWidget) => {
    event.preventDefault();
    event.stopPropagation();
    selectWidget(widget.id);
    const start = { x: event.clientX, y: event.clientY, widgetX: widget.x, widgetY: widget.y };
    const interactionStart = performance.now();

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      updateWidget(widget.id, {
        x: Math.max(0, start.widgetX + moveEvent.clientX - start.x),
        y: Math.max(0, start.widgetY + moveEvent.clientY - start.y)
      });
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      recordPerformanceMetric('EDITOR_INTERACTION', performance.now() - interactionStart);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const startResize = (event: PointerEvent<HTMLDivElement>, widget: ChartWidget) => {
    event.preventDefault();
    event.stopPropagation();
    selectWidget(widget.id);
    const start = { x: event.clientX, y: event.clientY, width: widget.width, height: widget.height };
    const interactionStart = performance.now();

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      updateWidget(widget.id, {
        width: Math.max(widget.type === 'text' ? TEXT_MIN_WIDTH : MIN_WIDTH, start.width + moveEvent.clientX - start.x),
        height: Math.max(widget.type === 'text' ? TEXT_MIN_HEIGHT : MIN_HEIGHT, start.height + moveEvent.clientY - start.y)
      });
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      recordPerformanceMetric('EDITOR_INTERACTION', performance.now() - interactionStart);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <section className="designer-canvas" onPointerDown={() => selectWidget(null)}>
      <div ref={x6Ref} className="x6-grid-layer" />
      <div className="widget-layer">
        {widgets.length === 0 && <Empty description="暂无图表" />}
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={`chart-widget ${selectedWidgetId === widget.id ? 'selected' : ''}`}
            style={{ left: widget.x, top: widget.y, width: widget.width, height: widget.height }}
            onPointerDown={(event) => startDrag(event, widget)}
          >
            <SafeChartRenderer widget={widget} rows={runtimeRows[widget.id]} filters={filters} />
            <div className="resize-handle" onPointerDown={(event) => startResize(event, widget)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
}
