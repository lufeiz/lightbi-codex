export type UserRole = 'admin' | 'editor' | 'viewer';
export type UserStatus = 'active' | 'disabled';

export interface UserDTO {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  role: UserRole;
  status: UserStatus;
}

export type ChartType =
  | 'detailTable'
  | 'pivotTable'
  | 'comparisonTable'
  | 'metricCard'
  | 'metricTrendCard'
  | 'line'
  | 'column'
  | 'bar'
  | 'stackedColumn'
  | 'stackedBar'
  | 'percentStackedColumn'
  | 'percentStackedBar'
  | 'pie'
  | 'donut'
  | 'richText'
  | 'text';

export type ChartStatus = 'draft' | 'published' | 'archived';
export type DatasetType = 'standard' | 'direct';

export interface DatasetField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'date';
}

export interface DatasetSummary {
  id: number;
  name: string;
  type: DatasetType;
  description: string;
  sourceName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetDetail extends DatasetSummary {
  dimensions: DatasetField[];
  measures: DatasetField[];
  rows: DataRow[];
}

export type DataRow = Record<string, string | number | null>;

export interface ChartTag {
  id: number;
  name: string;
  color: string;
  createdBy: number;
  updatedBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChartGroup {
  id: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
  createdBy: number;
  updatedBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChartGroupTreeNode extends ChartGroup {
  children: ChartGroupTreeNode[];
}

export interface ChartConfig {
  title: string;
  showLabel: boolean;
  showTooltip: boolean;
  showScrollbar: boolean;
  datasetType?: DatasetType;
  datasetId?: number;
  datasetName?: string;
  dimensions: string[];
  measures: string[];
  labelField?: string;
  previewRows?: DataRow[];
  fieldLabels?: Record<string, string>;
  textContent?: string;
  textHtml?: string;
  textBold?: boolean;
  textItalic?: boolean;
  textColor?: string;
}

export interface ChartWidget {
  id: string;
  type: ChartType;
  x: number;
  y: number;
  width: number;
  height: number;
  config: ChartConfig;
}

export interface DashboardFilters {
  timeFilter: DashboardTimeFilter;
  dimensionControls: DashboardDimensionFilter[];
}

export interface DashboardTimeFilter {
  label: string;
  chartId?: string;
  enabled?: boolean;
  range: [string, string] | null;
}

export interface DashboardDimensionFilter {
  id: string;
  label: string;
  chartId?: string;
  chartIds?: string[];
  field: string;
  fieldsByChart?: Record<string, string>;
  values: string[];
}

export interface ChartDocument {
  version: 1;
  widgets: ChartWidget[];
  filters?: DashboardFilters;
}

export interface ChartAsset {
  id: number;
  name: string;
  description: string;
  type: ChartType;
  status: ChartStatus;
  groupId: number | null;
  group?: ChartGroup | null;
  config: ChartDocument;
  tags: ChartTag[];
  createdBy: number;
  updatedBy: number;
  creator?: UserDTO;
  updater?: UserDTO;
  createdAt: string;
  updatedAt: string;
}

export interface ChartListResponse {
  items: ChartAsset[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChartQuery {
  keyword?: string;
  type?: ChartType;
  status?: ChartStatus;
  groupId?: number;
  tagIds?: number[];
  createdBy?: number;
  updatedFrom?: string;
  updatedTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ChartMutationPayload {
  name: string;
  description: string;
  type: ChartType;
  status: ChartStatus;
  groupId: number | null;
  tagIds: number[];
  config: ChartDocument;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  accountType: 'email' | 'phone';
  account: string;
  displayName: string;
  password: string;
  code: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserDTO;
}

export const chartTypeLabels: Record<ChartType, string> = {
  detailTable: '明细表',
  pivotTable: '交叉表',
  comparisonTable: '对比表',
  metricCard: '指标看板',
  metricTrendCard: '指标趋势卡',
  line: '折线图',
  column: '柱状图',
  bar: '条形图',
  stackedColumn: '堆叠柱状图',
  stackedBar: '堆叠条形图',
  percentStackedColumn: '堆叠百分比柱状图',
  percentStackedBar: '堆叠百分比条形图',
  pie: '饼图',
  donut: '环图',
  richText: '富文本',
  text: '文本框'
};

export const chartStatusLabels: Record<ChartStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档'
};

export const datasetTypeLabels: Record<DatasetType, string> = {
  standard: '标准数据集',
  direct: '直连数据集'
};
