import dayjs from 'dayjs';

import type { ChartGroup, ChartGroupTreeNode, ChartStatus, ChartType } from '@/types/domain';
import type { DataRow } from '@/types/domain';
import { chartStatusLabels, chartTypeLabels } from '@/types/domain';

export type ChartRendererKind = 'g2' | 's2' | 'metric' | 'text';

export interface ChartDefinition {
  type: ChartType;
  label: string;
  groupKey: string;
  groupTitle: string;
  renderer: ChartRendererKind;
  defaultWidth: number;
  defaultHeight: number;
  minDimensions: number;
  minMeasures: number;
  requiresDataset: boolean;
}

export const chartDefinitions: ChartDefinition[] = [
  chart('detailTable', 'table', '表格', 's2', 520, 320, 1, 0),
  chart('pivotTable', 'table', '表格', 's2', 520, 320, 1, 1),
  chart('comparisonTable', 'table', '表格', 's2', 520, 320, 1, 1),
  chart('metricCard', 'metric', '指标卡', 'metric', 320, 180, 0, 1),
  chart('metricTrendCard', 'metric', '指标卡', 'metric', 320, 220, 1, 1),
  chart('bar', 'bar', '柱条图', 'g2', 440, 300, 1, 1),
  chart('column', 'bar', '柱条图', 'g2', 440, 300, 1, 1),
  chart('stackedBar', 'bar', '柱条图', 'g2', 440, 300, 2, 1),
  chart('stackedColumn', 'bar', '柱条图', 'g2', 440, 300, 2, 1),
  chart('percentStackedBar', 'bar', '柱条图', 'g2', 440, 300, 2, 1),
  chart('percentStackedColumn', 'bar', '柱条图', 'g2', 440, 300, 2, 1),
  chart('line', 'line-area', '线面图', 'g2', 440, 300, 1, 1),
  chart('pie', 'line-area', '线面图', 'g2', 440, 300, 1, 1),
  chart('donut', 'line-area', '线面图', 'g2', 440, 300, 1, 1),
  chart('text', 'content', '内容组件', 'text', 360, 180, 0, 0, false),
  chart('richText', 'content', '内容组件', 'text', 360, 180, 0, 0, false)
];

export const chartDefinitionMap = new Map<ChartType, ChartDefinition>(chartDefinitions.map((definition) => [definition.type, definition]));

export const chartTypeGroups: Array<{ key: string; title: string; types: ChartType[] }> = chartDefinitions.reduce<Array<{ key: string; title: string; types: ChartType[] }>>(
  (groups, definition) => {
    let group = groups.find((item) => item.key === definition.groupKey);
    if (!group) {
      group = { key: definition.groupKey, title: definition.groupTitle, types: [] };
      groups.push(group);
    }
    group.types.push(definition.type);
    return groups;
  },
  []
);

export const chartTypeOptions = chartDefinitions.map((definition) => ({ value: definition.type, label: definition.label }));

export const chartStatusOptions = Object.entries(chartStatusLabels).map(([value, label]) => ({
  value: value as ChartStatus,
  label
}));

type PerformanceMetricName = 'FCP' | 'LCP' | 'CLS' | 'INP' | 'EDITOR_INTERACTION' | 'CHART_RENDER';
type EventPerformanceObserverInit = PerformanceObserverInit & { durationThreshold?: number };

export interface LightBIPerformanceMetric {
  name: PerformanceMetricName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  path: string;
  timestamp: number;
}

const clsSources = new WeakSet<PerformanceEntry>();

export function initPerformanceMonitoring() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return;
  }
  observePaint();
  observeLCP();
  observeCLS();
  observeINP();
}

export function recordPerformanceMetric(name: PerformanceMetricName, value: number) {
  emitMetric({
    name,
    value,
    rating: rateMetric(name, value),
    path: window.location.pathname,
    timestamp: Date.now()
  });
}

export function getChartDefinition(type: ChartType): ChartDefinition {
  return chartDefinitionMap.get(type) ?? chartDefinitions[0];
}

function chart(
  type: ChartType,
  groupKey: string,
  groupTitle: string,
  renderer: ChartRendererKind,
  defaultWidth: number,
  defaultHeight: number,
  minDimensions: number,
  minMeasures: number,
  requiresDataset = true
): ChartDefinition {
  return {
    type,
    label: chartTypeLabels[type],
    groupKey,
    groupTitle,
    renderer,
    defaultWidth,
    defaultHeight,
    minDimensions,
    minMeasures,
    requiresDataset
  };
}

function observePaint() {
  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntriesByName('first-contentful-paint').forEach((entry) => recordPerformanceMetric('FCP', entry.startTime));
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch {
    // Browser does not support this metric.
  }
}

function observeLCP() {
  try {
    const observer = new PerformanceObserver((list) => {
      const lastEntry = list.getEntries().at(-1);
      if (lastEntry) {
        recordPerformanceMetric('LCP', lastEntry.startTime);
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Browser does not support this metric.
  }
}

function observeCLS() {
  let cls = 0;
  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!layoutShift.hadRecentInput && !clsSources.has(entry)) {
          clsSources.add(entry);
          cls += layoutShift.value ?? 0;
          recordPerformanceMetric('CLS', cls);
        }
      });
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Browser does not support this metric.
  }
}

function observeINP() {
  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const interaction = entry as PerformanceEntry & { duration?: number; interactionId?: number };
        if (interaction.interactionId && interaction.duration) {
          recordPerformanceMetric('INP', interaction.duration);
        }
      });
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 40 } as EventPerformanceObserverInit);
  } catch {
    // Browser does not support this metric.
  }
}

function emitMetric(metric: LightBIPerformanceMetric) {
  window.dispatchEvent(new CustomEvent('lightbi:performance', { detail: metric }));
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[LightBI performance]', metric);
  }
}

function rateMetric(name: PerformanceMetricName, value: number): LightBIPerformanceMetric['rating'] {
  if (name === 'CLS') {
    return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
  }
  if (name === 'INP') {
    return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
  }
  if (name === 'FCP') {
    return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
  }
  if (name === 'LCP') {
    return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
  }
  return value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor';
}

export function buildGroupTree(groups: ChartGroup[]): ChartGroupTreeNode[] {
  const nodes = new Map<number, ChartGroupTreeNode>();
  groups.forEach((group) => nodes.set(group.id, { ...group, parentId: group.parentId ?? null, children: [] }));

  const roots: ChartGroupTreeNode[] = [];
  nodes.forEach((node) => {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return '-';
  }
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

export function formatDateByMoment(value?: string): string {
  if (!value) {
    return '-';
  }
  return dayjs(value).format('YYYY-MM-DD');
}

export const sampleRows: DataRow[] = [
  { category: '华东', value: 128, lastYear: 96, product: '仪表盘', month: '1月' },
  { category: '华南', value: 94, lastYear: 84, product: '报表', month: '2月' },
  { category: '华北', value: 156, lastYear: 118, product: '数据集', month: '3月' },
  { category: '西南', value: 72, lastYear: 64, product: '分析页', month: '4月' },
  { category: '西北', value: 48, lastYear: 38, product: '移动看板', month: '5月' }
];

export function groupToSelectOptions(groups: ChartGroup[]) {
  return groups.map((group) => ({
    value: group.id,
    label: group.name
  }));
}
