import type {
  AuthResponse,
  ChartAsset,
  ChartGroup,
  ChartListResponse,
  ChartMutationPayload,
  ChartQuery,
  ChartTag,
  DatasetDetail,
  DatasetField,
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
const ACCESS_TOKEN_KEY = 'lightbi.accessToken';

let memoryAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
let refreshPromise: Promise<AuthResponse> | null = null;

export function setApiAccessToken(token: string | null): void {
  memoryAccessToken = token;
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
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

async function refreshAccessToken(): Promise<boolean> {
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
  datasets(type?: DatasetType) {
    return request<DatasetSummary[]>(`/datasets${toQuery({ type })}`);
  },
  dataset(id: number) {
    return request<DatasetDetail>(`/datasets/${id}`);
  },
  datasetFields(id: number) {
    return request<{ dimensions: DatasetField[]; measures: DatasetField[] }>(`/datasets/${id}/fields`);
  },
  datasetRows(id: number) {
    return request<DatasetDetail['rows']>(`/datasets/${id}/rows`);
  }
};
