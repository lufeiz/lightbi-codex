import { create } from 'zustand';

import type { ChartDocument, ChartMutationPayload, ChartStatus, ChartType, ChartWidget } from '@/types/domain';
import { chartTypeLabels } from '@/types/domain';

interface DesignerMeta {
  id?: number;
  name: string;
  description: string;
  status: ChartStatus;
  groupId: number | null;
  tagIds: number[];
}

interface DesignerState {
  meta: DesignerMeta;
  widgets: ChartWidget[];
  selectedWidgetId: string | null;
  reset: () => void;
  load: (payload: Partial<DesignerMeta> & { config?: ChartDocument; type?: ChartType }) => void;
  setMeta: (meta: Partial<DesignerMeta>) => void;
  addWidget: (type: ChartType) => void;
  selectWidget: (id: string | null) => void;
  syncPrimaryTitle: (title: string) => void;
  updateWidget: (id: string, patch: Partial<ChartWidget>) => void;
  updateWidgetConfig: (id: string, patch: Partial<ChartWidget['config']>) => void;
  toPayload: () => ChartMutationPayload;
}

const defaultMeta: DesignerMeta = {
  name: '未命名仪表盘',
  description: '',
  status: 'draft',
  groupId: null,
  tagIds: []
};

export const useDesignerStore = create<DesignerState>((set, get) => ({
  meta: defaultMeta,
  widgets: [],
  selectedWidgetId: null,
  reset() {
    set({ meta: defaultMeta, widgets: [], selectedWidgetId: null });
  },
  load(payload) {
    const widgets = payload.config?.widgets?.length ? payload.config.widgets : [];
    set({
      meta: {
        ...defaultMeta,
        id: payload.id,
        name: payload.name ?? defaultMeta.name,
        description: payload.description ?? '',
        status: payload.status ?? 'draft',
        groupId: payload.groupId ?? null,
        tagIds: payload.tagIds ?? []
      },
      widgets,
      selectedWidgetId: widgets[0]?.id ?? null
    });
  },
  setMeta(meta) {
    set((state) => ({ meta: { ...state.meta, ...meta } }));
  },
  addWidget(type) {
    const index = get().widgets.length;
    const widget = createWidget(type, 72 + index * 24, 64 + index * 24);
    set((state) => ({
      widgets: [...state.widgets, widget],
      selectedWidgetId: widget.id
    }));
  },
  selectWidget(id) {
    set({ selectedWidgetId: id });
  },
  syncPrimaryTitle(title) {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    set((state) => {
      const targetId = state.selectedWidgetId ?? state.widgets[0]?.id;
      return {
        widgets: state.widgets.map((widget) =>
          widget.id === targetId ? { ...widget, config: { ...widget.config, title: nextTitle } } : widget
        )
      };
    });
  },
  updateWidget(id, patch) {
    set((state) => ({
      widgets: state.widgets.map((widget) => (widget.id === id ? { ...widget, ...patch } : widget))
    }));
  },
  updateWidgetConfig(id, patch) {
    set((state) => ({
      widgets: state.widgets.map((widget) =>
        widget.id === id ? { ...widget, config: { ...widget.config, ...patch } } : widget
      )
    }));
  },
  toPayload() {
    const state = get();
    const primary = state.widgets[0];
    return {
      name: state.meta.name.trim(),
      description: state.meta.description,
      status: state.meta.status,
      groupId: state.meta.groupId,
      tagIds: state.meta.tagIds,
      type: primary?.type ?? 'line',
      config: {
        version: 1,
        widgets: state.widgets
      }
    };
  }
}));

function createWidget(type: ChartType, x: number, y: number): ChartWidget {
  return {
    id: safeId(),
    type,
    x,
    y,
    width: type.includes('Table') ? 520 : 440,
    height: type.includes('Table') ? 320 : 300,
    config: {
      title: chartTypeLabels[type],
      showLabel: true,
      showTooltip: true,
      showScrollbar: type.includes('Table'),
      dimensions: [],
      measures: [],
      labelField: '销售额'
    }
  };
}

function safeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
