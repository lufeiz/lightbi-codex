import type {
  AuthResponse,
  AuditLogEntry,
  ChartAsset,
  ChartGroup,
  ChartListResponse,
  ChartMutationPayload,
  ChartQuery,
  ChartTag,
  DataSourceMutationPayload,
  DataSourceSummary,
  DashboardShareLink,
  DashboardSubscription,
  DatasetDetail,
  DatasetField,
  DatasetMutationPayload,
  DatasetQueryRequest,
  DatasetQueryResponse,
  DatasetSummary,
  DatasetType,
  ExportRequest,
  ExportResponse,
  LoginPayload,
  ProjectMember,
  ProjectSummary,
  PublishedDashboard,
  RegisterPayload,
  UserDTO,
  WorkspaceMember,
  WorkspaceSummary,
  ChartVersion
} from '@/types/domain';

interface APIEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const API_BASE_URL = process.env.API_BASE_URL ?? '/api';

let memoryAccessToken: string | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;

export function setApiAccessToken(token: string | null): void {
  memoryAccessToken = token;
}

export function getApiAccessToken(): string | null {
  return memoryAccessToken;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryAccessToken) {
    headers.set('Authorization', `Bearer ${memoryAccessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include'
  });

  if (response.status === 401 && retry && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  const payload = (await response.json().catch(() => null)) as APIEnvelope<T> | null;
  if (!response.ok || !payload || payload.code !== 0) {
    throw new Error(payload?.message ?? `Request failed with ${response.status}`);
  }
  return payload.data;
}

export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = request<AuthResponse>('/auth/refresh', { method: 'POST' }, false).finally(() => {
      refreshPromise = null;
    });
  }
  try {
    const data = await refreshPromise;
    setApiAccessToken(data.accessToken);
    return true;
  } catch {
    setApiAccessToken(null);
    return false;
  }
}

function toQuery(params: object): string {
  const search = new URLSearchParams();
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        search.set(key, value.join(','));
      }
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const api = {
  login(payload: LoginPayload) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  register(payload: RegisterPayload) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  logout() {
    return request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }, false);
  },
  me() {
    return request<UserDTO>('/auth/me');
  },
  users() {
    return request<UserDTO[]>('/users');
  },
  chartCreators() {
    return request<UserDTO[]>('/charts/creators');
  },
  workspaces() {
    return request<WorkspaceSummary[]>('/workspaces');
  },
  createWorkspace(payload: Pick<WorkspaceSummary, 'name' | 'description'>) {
    return request<WorkspaceSummary>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateWorkspace(id: number, payload: Pick<WorkspaceSummary, 'name' | 'description'>) {
    return request<WorkspaceSummary>(`/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  workspaceMembers(id: number) {
    return request<WorkspaceMember[]>(`/workspaces/${id}/members`);
  },
  upsertWorkspaceMember(id: number, payload: { userId: number; role: WorkspaceMember['role'] }) {
    return request<WorkspaceMember>(`/workspaces/${id}/members`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  projects(workspaceId?: number) {
    return request<ProjectSummary[]>(`/projects${toQuery({ workspaceId })}`);
  },
  createProject(payload: Pick<ProjectSummary, 'workspaceId' | 'name' | 'description'> & { ownerId?: number }) {
    return request<ProjectSummary>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateProject(id: number, payload: Partial<Pick<ProjectSummary, 'name' | 'description' | 'ownerId'>>) {
    return request<ProjectSummary>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  projectMembers(id: number) {
    return request<ProjectMember[]>(`/projects/${id}/members`);
  },
  upsertProjectMember(id: number, payload: { userId: number; role: ProjectMember['role'] }) {
    return request<ProjectMember>(`/projects/${id}/members`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  publishedDashboard(id: number) {
    return request<PublishedDashboard>(`/dashboards/${id}/published`);
  },
  publicShare(token: string) {
    return request<PublishedDashboard>(`/public/shares/${encodeURIComponent(token)}`, {}, false);
  },
  publicEmbed(token: string) {
    return request<PublishedDashboard>(`/public/embeds/${encodeURIComponent(token)}`, {}, false);
  },
  charts(query: ChartQuery) {
    return request<ChartListResponse>(`/charts${toQuery(query)}`);
  },
  chart(id: number) {
    return request<ChartAsset>(`/charts/${id}`);
  },
  createChart(payload: ChartMutationPayload) {
    return request<ChartAsset>('/charts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateChart(id: number, payload: ChartMutationPayload) {
    return request<ChartAsset>(`/charts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  deleteChart(id: number) {
    return request<{ deleted: boolean }>(`/charts/${id}`, { method: 'DELETE' });
  },
  copyChart(id: number) {
    return request<ChartAsset>(`/charts/${id}/copy`, { method: 'POST' });
  },
  publishChart(id: number) {
    return request<ChartAsset>(`/charts/${id}/publish`, { method: 'POST' });
  },
  archiveChart(id: number) {
    return request<ChartAsset>(`/charts/${id}/archive`, { method: 'POST' });
  },
  chartVersions(id: number) {
    return request<ChartVersion[]>(`/charts/${id}/versions`);
  },
  chartVersion(id: number, versionId: number) {
    return request<ChartVersion>(`/charts/${id}/versions/${versionId}`);
  },
  rollbackChart(id: number, versionId: number) {
    return request<ChartAsset>(`/charts/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ versionId })
    });
  },
  chartAuditLogs(id: number) {
    return request<AuditLogEntry[]>(`/charts/${id}/audit-logs`);
  },
  shareLinks(id: number) {
    return request<DashboardShareLink[]>(`/charts/${id}/share-links`);
  },
  createShareLink(id: number, payload: { name: string; enabled?: boolean; allowEmbed: boolean; expiresAt?: string | null }) {
    return request<DashboardShareLink>(`/charts/${id}/share-links`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateShareLink(id: number, linkId: number, payload: { name?: string; enabled?: boolean; allowEmbed: boolean; expiresAt?: string | null }) {
    return request<DashboardShareLink>(`/charts/${id}/share-links/${linkId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  deleteShareLink(id: number, linkId: number) {
    return request<{ deleted: boolean }>(`/charts/${id}/share-links/${linkId}`, { method: 'DELETE' });
  },
  exportChart(id: number, payload: ExportRequest) {
    return request<ExportResponse>(`/charts/${id}/export`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  subscriptions(id: number) {
    return request<DashboardSubscription[]>(`/charts/${id}/subscriptions`);
  },
  createSubscription(id: number, payload: Pick<DashboardSubscription, 'name' | 'format' | 'frequency'> & { enabled?: boolean; nextRunAt?: string | null }) {
    return request<DashboardSubscription>(`/charts/${id}/subscriptions`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateSubscription(id: number, subscriptionId: number, payload: Partial<Pick<DashboardSubscription, 'name' | 'format' | 'frequency' | 'enabled' | 'nextRunAt'>>) {
    return request<DashboardSubscription>(`/charts/${id}/subscriptions/${subscriptionId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  deleteSubscription(id: number, subscriptionId: number) {
    return request<{ deleted: boolean }>(`/charts/${id}/subscriptions/${subscriptionId}`, { method: 'DELETE' });
  },
  runSubscription(id: number) {
    return request<DashboardSubscription>(`/subscriptions/${id}/run`, { method: 'POST' });
  },
  groups(scope?: { workspaceId?: number; projectId?: number }) {
    return request<ChartGroup[]>(`/chart-groups${toQuery(scope ?? {})}`);
  },
  createGroup(payload: Pick<ChartGroup, 'name' | 'parentId' | 'sortOrder'> & { workspaceId?: number; projectId?: number }) {
    return request<ChartGroup>('/chart-groups', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateGroup(id: number, payload: Pick<ChartGroup, 'name' | 'parentId' | 'sortOrder'>) {
    return request<ChartGroup>(`/chart-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  deleteGroup(id: number) {
    return request<{ deleted: boolean }>(`/chart-groups/${id}`, { method: 'DELETE' });
  },
  tags(scope?: { workspaceId?: number; projectId?: number }) {
    return request<ChartTag[]>(`/chart-tags${toQuery(scope ?? {})}`);
  },
  createTag(payload: Pick<ChartTag, 'name' | 'color'> & { workspaceId?: number; projectId?: number }) {
    return request<ChartTag>('/chart-tags', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateTag(id: number, payload: Pick<ChartTag, 'name' | 'color'>) {
    return request<ChartTag>(`/chart-tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  deleteTag(id: number) {
    return request<{ deleted: boolean }>(`/chart-tags/${id}`, { method: 'DELETE' });
  },
  dataSources(scope?: { workspaceId?: number; projectId?: number }) {
    return request<DataSourceSummary[]>(`/data-sources${toQuery(scope ?? {})}`);
  },
  createDataSource(payload: DataSourceMutationPayload) {
    return request<DataSourceSummary>('/data-sources', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateDataSource(id: number, payload: DataSourceMutationPayload) {
    return request<DataSourceSummary>(`/data-sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  deleteDataSource(id: number) {
    return request<{ deleted: boolean }>(`/data-sources/${id}`, { method: 'DELETE' });
  },
  testDataSource(id: number) {
    return request<{ ok: boolean }>(`/data-sources/${id}/test`, { method: 'POST' });
  },
  datasets(type?: DatasetType, scope?: { workspaceId?: number; projectId?: number }) {
    return request<DatasetSummary[]>(`/datasets${toQuery({ type, ...(scope ?? {}) })}`);
  },
  dataset(id: number) {
    return request<DatasetDetail>(`/datasets/${id}`);
  },
  createDataset(payload: DatasetMutationPayload) {
    return request<DatasetSummary>('/datasets', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateDataset(id: number, payload: DatasetMutationPayload) {
    return request<DatasetSummary>(`/datasets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  deleteDataset(id: number) {
    return request<{ deleted: boolean }>(`/datasets/${id}`, { method: 'DELETE' });
  },
  datasetFields(id: number) {
    return request<{ dimensions: DatasetField[]; measures: DatasetField[] }>(`/datasets/${id}/fields`);
  },
  datasetRows(id: number) {
    return request<NonNullable<DatasetDetail['rows']>>(`/datasets/${id}/rows`);
  },
  previewDataset(id: number, payload: DatasetQueryRequest) {
    return request<DatasetQueryResponse>(`/datasets/${id}/preview`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  queryDataset(id: number, payload: DatasetQueryRequest) {
    return request<DatasetQueryResponse>(`/datasets/${id}/query`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  refreshDataset(id: number) {
    return request<{ refreshed: boolean }>(`/datasets/${id}/refresh`, { method: 'POST' });
  }
};
