import dayjs from 'dayjs';
import moment from 'moment';

import type { ChartGroup, ChartGroupTreeNode, ChartStatus, ChartType } from '@/types/domain';
import type { DataRow } from '@/types/domain';
import { chartStatusLabels, chartTypeLabels } from '@/types/domain';

export const chartTypeOptions = Object.entries(chartTypeLabels).map(([value, label]) => ({ value: value as ChartType, label }));
export const chartStatusOptions = Object.entries(chartStatusLabels).map(([value, label]) => ({
  value: value as ChartStatus,
  label
}));

export const chartTypeGroups: Array<{ key: string; title: string; types: ChartType[] }> = [
  { key: 'table', title: '图表', types: ['detailTable', 'pivotTable', 'comparisonTable'] },
  { key: 'bar', title: '柱条图', types: ['bar', 'column'] },
  { key: 'line-area', title: '线面图', types: ['line', 'pie'] },
  { key: 'content', title: '内容组件', types: ['text'] }
];

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
  return moment(value).format('YYYY-MM-DD');
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
