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
export type DatasetType = 'standard' | 'direct' | 'sql';
export type DataSourceType = 'mysql' | 'postgres';
export type DataSourceStatus = 'active' | 'disabled';

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
  dataSourceId?: number | null;
  cacheTtl?: number;
  refreshEvery?: number;
  queryTimeout?: number;
  rowLimit?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetDetail extends DatasetSummary {
  dimensions: DatasetField[];
  measures: DatasetField[];
  fields?: DatasetField[];
  querySql?: string;
  rows?: DataRow[];
}

export type DataRow = Record<string, string | number | null>;

export interface DataSourceSummary {
  id: number;
  name: string;
  type: DataSourceType;
  status: DataSourceStatus;
  description: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  sslMode: string;
  maxOpenConns: number;
  maxIdleConns: number;
  connMaxLifetimeSecs: number;
  createdAt: string;
  updatedAt: string;
}

export interface DataSourceMutationPayload {
  name: string;
  type: DataSourceType;
  status: DataSourceStatus;
  description: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password?: string;
  sslMode: string;
  params?: Record<string, string>;
  maxOpenConns: number;
  maxIdleConns: number;
  connMaxLifetimeSecs: number;
}

export interface DatasetMutationPayload {
  name: string;
  type: DatasetType;
  description: string;
  sourceName: string;
  dataSourceId?: number | null;
  querySql: string;
  dimensions: DatasetField[];
  measures: DatasetField[];
  cacheTtl: number;
  refreshEvery: number;
  queryTimeout: number;
  rowLimit: number;
}

export type MetricAggregation = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface DatasetQueryMetric {
  field: string;
  aggregation: MetricAggregation;
  alias?: string;
}

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'between';
  value?: string | number | null;
  values?: Array<string | number | null>;
}

export interface QuerySort {
  field: string;
  order: 'asc' | 'desc';
}

export interface DatasetQueryConfig {
  dimensions: string[];
  metrics: DatasetQueryMetric[];
  filters?: QueryFilter[];
  sorts?: QuerySort[];
  topN?: number;
  limit?: number;
  timeComparison?: 'none' | 'yoy' | 'mom';
}

export interface DatasetQueryRequest extends DatasetQueryConfig {}

export interface DatasetQueryColumn {
  name: string;
  label: string;
  role: 'dimension' | 'measure';
  type: string;
}

export interface DatasetQueryResponse {
  columns: DatasetQueryColumn[];
  rows: DataRow[];
  cached: boolean;
  executedAt: string;
  expiresAt?: string;
}

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
  query?: DatasetQueryConfig;
  labelField?: string;
  // Deprecated legacy snapshot. New saves strip this field before sending config to the backend.
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
  version: 1 | 2;
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
  direct: '直连数据集',
  sql: 'SQL 数据集'
};

export const dataSourceTypeLabels: Record<DataSourceType, string> = {
  mysql: 'MySQL',
  postgres: 'PostgreSQL'
};

export const dataSourceStatusLabels: Record<DataSourceStatus, string> = {
  active: '启用',
  disabled: '停用'
};
