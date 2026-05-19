import { Graph } from '@antv/x6';
import { Empty } from 'antd';
import type { PointerEvent } from 'react';
import { useEffect, useRef } from 'react';

import { ChartRenderer } from '@/features/charts/ChartRenderer';
import { useDesignerStore } from '@/store/designerStore';
import type { ChartWidget } from '@/types/domain';

const MIN_WIDTH = 280;
const MIN_HEIGHT = 220;

export function DesignerCanvas() {
  const x6Ref = useRef<HTMLDivElement | null>(null);
  const widgets = useDesignerStore((state) => state.widgets);
  const selectedWidgetId = useDesignerStore((state) => state.selectedWidgetId);
  const selectWidget = useDesignerStore((state) => state.selectWidget);
  const updateWidget = useDesignerStore((state) => state.updateWidget);

  useEffect(() => {
    if (!x6Ref.current) {
      return undefined;
    }
    const graph = new Graph({
      container: x6Ref.current,
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
    return () => {
      graph.dispose();
    };
  }, []);

  const startDrag = (event: PointerEvent<HTMLDivElement>, widget: ChartWidget) => {
    event.preventDefault();
    event.stopPropagation();
    selectWidget(widget.id);
    const start = { x: event.clientX, y: event.clientY, widgetX: widget.x, widgetY: widget.y };

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      updateWidget(widget.id, {
        x: Math.max(0, start.widgetX + moveEvent.clientX - start.x),
        y: Math.max(0, start.widgetY + moveEvent.clientY - start.y)
      });
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const startResize = (event: PointerEvent<HTMLDivElement>, widget: ChartWidget) => {
    event.preventDefault();
    event.stopPropagation();
    selectWidget(widget.id);
    const start = { x: event.clientX, y: event.clientY, width: widget.width, height: widget.height };

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      updateWidget(widget.id, {
        width: Math.max(MIN_WIDTH, start.width + moveEvent.clientX - start.x),
        height: Math.max(MIN_HEIGHT, start.height + moveEvent.clientY - start.y)
      });
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <section className="designer-canvas" onPointerDown={() => selectWidget(null)}>
      <div ref={x6Ref} className="x6-grid-layer" />
      <div className="widget-layer">
        {widgets.length === 0 && <Empty description="点击左上角添加图表，开始搭建仪表盘" />}
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={`chart-widget ${selectedWidgetId === widget.id ? 'selected' : ''}`}
            style={{ left: widget.x, top: widget.y, width: widget.width, height: widget.height }}
            onPointerDown={(event) => startDrag(event, widget)}
          >
            <ChartRenderer widget={widget} />
            <div className="resize-handle" onPointerDown={(event) => startResize(event, widget)} />
          </div>
        ))}
      </div>
    </section>
  );
}
