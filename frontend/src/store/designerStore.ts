import { create } from 'zustand';

import { getChartDefinition } from '@/features/charts/chartUtils';
import type { ChartDocument, ChartMutationPayload, ChartStatus, ChartType, ChartWidget, DashboardDimensionFilter, DashboardFilters, DataRow } from '@/types/domain';
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
  runtimeRows: Record<string, DataRow[]>;
  filters: DashboardFilters;
  selectedWidgetId: string | null;
  historyPast: DesignerSnapshot[];
  historyFuture: DesignerSnapshot[];
  reset: () => void;
  load: (payload: Partial<DesignerMeta> & { config?: ChartDocument; type?: ChartType }) => void;
  setMeta: (meta: Partial<DesignerMeta>) => void;
  setFilters: (filters: Partial<DashboardFilters>) => void;
  resetFilters: () => void;
  addWidget: (type: ChartType) => void;
  deleteWidget: (id: string) => void;
  duplicateSelectedWidget: () => void;
  alignSelectedWidget: (mode: 'left' | 'top') => void;
  undo: () => void;
  redo: () => void;
  selectWidget: (id: string | null) => void;
  syncPrimaryTitle: (title: string) => void;
  updateWidget: (id: string, patch: Partial<ChartWidget>) => void;
  updateWidgetConfig: (id: string, patch: Partial<ChartWidget['config']>) => void;
  setWidgetRows: (id: string, rows: DataRow[]) => void;
  toPayload: () => ChartMutationPayload;
}

interface DesignerSnapshot {
  widgets: ChartWidget[];
  filters: DashboardFilters;
  selectedWidgetId: string | null;
}

const defaultMeta: DesignerMeta = {
  name: '未命名仪表盘',
  description: '',
  status: 'draft',
  groupId: null,
  tagIds: []
};

const createDefaultFilters = (): DashboardFilters => ({
  timeFilter: {
    label: '日期',
    enabled: false,
    range: null
  },
  dimensionControls: []
});

const maxHistoryEntries = 50;

export const useDesignerStore = create<DesignerState>((set, get) => ({
  meta: defaultMeta,
  widgets: [],
  runtimeRows: {},
  filters: createDefaultFilters(),
  selectedWidgetId: null,
  historyPast: [],
  historyFuture: [],
  reset() {
    set({ meta: defaultMeta, widgets: [], runtimeRows: {}, filters: createDefaultFilters(), selectedWidgetId: null, historyPast: [], historyFuture: [] });
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
      runtimeRows: Object.fromEntries(widgets.map((widget) => [widget.id, widget.config.previewRows ?? []])),
      filters: normalizeFilters(payload.config?.filters, widgets),
      selectedWidgetId: widgets[0]?.id ?? null,
      historyPast: [],
      historyFuture: []
    });
  },
  setMeta(meta) {
    set((state) => ({ meta: { ...state.meta, ...meta } }));
  },
  setFilters(filters) {
    set((state) => ({ filters: { ...state.filters, ...filters } }));
  },
  resetFilters() {
    set({ filters: createDefaultFilters() });
  },
  addWidget(type) {
    const widgets = get().widgets;
    const widget = createWidget(type, 0, 0);
    const position = findOpenPosition(widget, widgets);
    widget.x = position.x;
    widget.y = position.y;
    set((state) => ({
      ...pushHistory(state),
      widgets: [...state.widgets, widget],
      selectedWidgetId: widget.id
    }));
  },
  deleteWidget(id) {
    set((state) => {
      const targetIndex = state.widgets.findIndex((widget) => widget.id === id);
      if (targetIndex < 0) {
        return state;
      }
      const widgets = state.widgets.filter((widget) => widget.id !== id);
      const nextSelectedWidget = widgets[targetIndex] ?? widgets[targetIndex - 1] ?? widgets[0] ?? null;
      return {
        ...pushHistory(state),
        widgets,
        selectedWidgetId: state.selectedWidgetId === id ? (nextSelectedWidget?.id ?? null) : state.selectedWidgetId,
        filters: removeWidgetFromFilters(state.filters, id)
      };
    });
  },
  duplicateSelectedWidget() {
    set((state) => {
      const source = state.widgets.find((widget) => widget.id === state.selectedWidgetId);
      if (!source) {
        return state;
      }
      const widget = cloneValue(source);
      widget.id = safeId();
      widget.x = source.x + 32;
      widget.y = source.y + 32;
      widget.config = {
        ...widget.config,
        title: `${source.config.title || chartTypeLabels[source.type]} 副本`
      };
      const position = findOpenPosition(widget, state.widgets);
      widget.x = position.x;
      widget.y = position.y;
      return {
        ...pushHistory(state),
        widgets: [...state.widgets, widget],
        selectedWidgetId: widget.id
      };
    });
  },
  alignSelectedWidget(mode) {
    set((state) => {
      const target = state.widgets.find((widget) => widget.id === state.selectedWidgetId);
      if (!target || state.widgets.length < 2) {
        return state;
      }
      const value = mode === 'left'
        ? Math.min(...state.widgets.map((widget) => widget.x))
        : Math.min(...state.widgets.map((widget) => widget.y));
      return {
        ...pushHistory(state),
        widgets: state.widgets.map((widget) =>
          widget.id === target.id ? { ...widget, [mode === 'left' ? 'x' : 'y']: value } : widget
        )
      };
    });
  },
  undo() {
    set((state) => {
      const previous = state.historyPast.at(-1);
      if (!previous) {
        return state;
      }
      const current = snapshotDesignerState(state);
      return {
        widgets: cloneValue(previous.widgets),
        filters: cloneValue(previous.filters),
        selectedWidgetId: previous.selectedWidgetId,
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [current, ...state.historyFuture].slice(0, maxHistoryEntries)
      };
    });
  },
  redo() {
    set((state) => {
      const next = state.historyFuture[0];
      if (!next) {
        return state;
      }
      const current = snapshotDesignerState(state);
      return {
        widgets: cloneValue(next.widgets),
        filters: cloneValue(next.filters),
        selectedWidgetId: next.selectedWidgetId,
        historyPast: [...state.historyPast, current].slice(-maxHistoryEntries),
        historyFuture: state.historyFuture.slice(1)
      };
    });
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
      widgets: state.widgets.map((widget) => {
        if (widget.id !== id) {
          return widget;
        }
        const nextWidget = { ...widget, ...patch };
        if (hasGeometryPatch(patch) && hasOverlap(nextWidget, state.widgets.filter((item) => item.id !== id))) {
          return widget;
        }
        return nextWidget;
      })
    }));
  },
  updateWidgetConfig(id, patch) {
    set((state) => ({
      widgets: state.widgets.map((widget) =>
        widget.id === id ? { ...widget, config: { ...widget.config, ...patch } } : widget
      )
    }));
  },
  setWidgetRows(id, rows) {
    set((state) => ({ runtimeRows: { ...state.runtimeRows, [id]: rows } }));
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
        version: 2,
        widgets: state.widgets.map(stripRuntimeConfig),
        filters: state.filters
      }
    };
  }
}));

function pushHistory(state: DesignerState): Pick<DesignerState, 'historyPast' | 'historyFuture'> {
  return {
    historyPast: [...state.historyPast, snapshotDesignerState(state)].slice(-maxHistoryEntries),
    historyFuture: []
  };
}

function snapshotDesignerState(state: DesignerState): DesignerSnapshot {
  return {
    widgets: cloneValue(state.widgets),
    filters: cloneValue(state.filters),
    selectedWidgetId: state.selectedWidgetId
  };
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createWidget(type: ChartType, x: number, y: number): ChartWidget {
  const definition = getChartDefinition(type);
  const isTable = definition.renderer === 's2';
  const isText = definition.renderer === 'text';

  return {
    id: safeId(),
    type,
    x,
    y,
    width: definition.defaultWidth,
    height: definition.defaultHeight,
    config: {
      title: chartTypeLabels[type],
      showLabel: true,
      showTooltip: true,
      showScrollbar: isTable,
      theme: 'default',
      labelSize: 12,
      enableLinkage: false,
      linkageMode: 'filter',
      dimensions: [],
      measures: [],
      query: { dimensions: [], metrics: [], filters: [], sorts: [], limit: 500, timeComparison: 'none' },
      labelField: '销售额',
      textContent: isText ? '输入文本内容' : undefined,
      textHtml: isText ? '输入文本内容' : undefined
    }
  };
}

function stripRuntimeConfig(widget: ChartWidget): ChartWidget {
  const { previewRows: _previewRows, ...config } = widget.config;
  return { ...widget, config };
}

interface LegacyDashboardFilters extends Partial<DashboardFilters> {
  timeRange?: [string, string] | null;
  dimensionField?: string;
  dimensionValues?: string[];
  dimensionFilters?: Array<{ field: string; values?: string[] }>;
  chartDimensionFilters?: Record<string, Array<{ field: string; values?: string[] }>>;
}

function normalizeFilters(filters: LegacyDashboardFilters | undefined, widgets: ChartWidget[]): DashboardFilters {
  if (!filters) {
    return createDefaultFilters();
  }

  const dimensionControls = normalizeDimensionControls(filters, widgets);
  const range = Array.isArray(filters.timeFilter?.range)
    ? filters.timeFilter.range
    : Array.isArray(filters.timeRange) && filters.timeRange.length === 2
      ? filters.timeRange
      : null;

  return {
    timeFilter: {
      label: filters.timeFilter?.label || '日期',
      enabled: filters.timeFilter?.enabled ?? Boolean(range),
      range
    },
    dimensionControls
  };
}

function normalizeDimensionControls(filters: LegacyDashboardFilters, widgets: ChartWidget[]): DashboardDimensionFilter[] {
  if (Array.isArray(filters.dimensionControls) && filters.dimensionControls.length) {
    return filters.dimensionControls
      .filter((control) => typeof control.id === 'string' && control.id.length > 0)
      .map((control) => ({
        id: control.id,
        label: control.label || '维度',
        chartIds: Array.isArray(control.chartIds)
          ? control.chartIds.map(String)
          : control.chartId
            ? [String(control.chartId)]
            : [],
        field: control.field,
        fieldsByChart: control.fieldsByChart ?? {},
        values: Array.isArray(control.values) ? control.values.map(String) : []
      }));
  }

  if (filters.chartDimensionFilters) {
    return Object.entries(filters.chartDimensionFilters).flatMap(([chartId, items]) =>
      Array.isArray(items)
      ? items
          .filter((filter) => typeof filter.field === 'string' && filter.field.length > 0)
          .map((filter) => ({
            id: createFilterId(),
            label: '维度',
            chartIds: [String(chartId)],
            field: filter.field,
            fieldsByChart: {},
            values: Array.isArray(filter.values) ? filter.values.map(String) : []
          }))
      : []
    );
  }

  if (Array.isArray(filters.dimensionFilters)) {
    return filters.dimensionFilters
      .filter((filter) => typeof filter.field === 'string' && filter.field.length > 0)
      .map((filter) => ({
        id: createFilterId(),
        label: '维度',
        chartIds: [],
        field: filter.field,
        fieldsByChart: {},
        values: Array.isArray(filter.values) ? filter.values.map(String) : []
      }));
  }

  if (!filters.dimensionField) {
    return [];
  }
  return [
    {
      id: createFilterId(),
      label: '维度',
      chartIds: [],
      field: filters.dimensionField,
      fieldsByChart: {},
      values: Array.isArray(filters.dimensionValues) ? filters.dimensionValues.map(String) : []
    }
  ];
}

function removeWidgetFromFilters(filters: DashboardFilters, widgetId: string): DashboardFilters {
  return {
    timeFilter: filters.timeFilter.chartId === widgetId ? { ...filters.timeFilter, chartId: undefined } : filters.timeFilter,
    dimensionControls: filters.dimensionControls.map((control) => ({
      ...control,
      chartId: control.chartId === widgetId ? undefined : control.chartId,
      chartIds: control.chartIds?.filter((id) => id !== widgetId),
      fieldsByChart: Object.fromEntries(Object.entries(control.fieldsByChart ?? {}).filter(([id]) => id !== widgetId))
    }))
  };
}

function createFilterId(): string {
  return `filter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const WIDGET_GAP = 24;
const DEFAULT_WIDGET_X = 32;
const DEFAULT_WIDGET_Y = 32;

function findOpenPosition(widget: ChartWidget, widgets: ChartWidget[]): Pick<ChartWidget, 'x' | 'y'> {
  if (widgets.length === 0) {
    return { x: DEFAULT_WIDGET_X, y: DEFAULT_WIDGET_Y };
  }

  const sorted = [...widgets].sort((a, b) => a.y + a.height - (b.y + b.height));
  const bottom = sorted.reduce((max, item) => Math.max(max, item.y + item.height), DEFAULT_WIDGET_Y);
  const candidate = { ...widget, x: DEFAULT_WIDGET_X, y: bottom + WIDGET_GAP };

  if (!hasOverlap(candidate, widgets)) {
    return { x: candidate.x, y: candidate.y };
  }

  for (let y = DEFAULT_WIDGET_Y; y <= bottom + widget.height + WIDGET_GAP * 12; y += WIDGET_GAP) {
    for (let x = DEFAULT_WIDGET_X; x <= 1440; x += widget.width + WIDGET_GAP) {
      const next = { ...widget, x, y };
      if (!hasOverlap(next, widgets)) {
        return { x, y };
      }
    }
  }

  return { x: DEFAULT_WIDGET_X, y: bottom + widget.height + WIDGET_GAP };
}

function hasGeometryPatch(patch: Partial<ChartWidget>): boolean {
  return patch.x !== undefined || patch.y !== undefined || patch.width !== undefined || patch.height !== undefined;
}

function hasOverlap(widget: ChartWidget, widgets: ChartWidget[]): boolean {
  return widgets.some((item) => rectanglesOverlap(widget, item));
}

function rectanglesOverlap(a: ChartWidget, b: ChartWidget): boolean {
  return !(
    a.x + a.width + WIDGET_GAP <= b.x ||
    b.x + b.width + WIDGET_GAP <= a.x ||
    a.y + a.height + WIDGET_GAP <= b.y ||
    b.y + b.height + WIDGET_GAP <= a.y
  );
}

function safeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
