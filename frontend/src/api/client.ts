import type {
  AuthResponse,
  ChartAsset,
  ChartGroup,
  ChartListResponse,
  ChartMutationPayload,
  ChartQuery,
  ChartTag,
  DataSourceMutationPayload,
  DataSourceSummary,
  DatasetDetail,
  DatasetField,
  DatasetMutationPayload,
  DatasetQueryRequest,
  DatasetQueryResponse,
  DatasetSummary,
  DatasetType,
  LoginPayload,
  RegisterPayload,
  UserDTO
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
  groups() {
    return request<ChartGroup[]>('/chart-groups');
  },
  createGroup(payload: Pick<ChartGroup, 'name' | 'parentId' | 'sortOrder'>) {
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
  tags() {
    return request<ChartTag[]>('/chart-tags');
  },
  createTag(payload: Pick<ChartTag, 'name' | 'color'>) {
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
  dataSources() {
    return request<DataSourceSummary[]>('/data-sources');
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
  datasets(type?: DatasetType) {
    return request<DatasetSummary[]>(`/datasets${toQuery({ type })}`);
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
