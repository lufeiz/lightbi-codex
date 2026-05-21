import { expect, test } from '@playwright/test';

const user = {
  id: 1,
  username: 'admin',
  displayName: '系统管理员',
  email: 'admin@lightbi.local',
  phone: null,
  role: 'admin',
  status: 'active'
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api', '');
    const method = route.request().method();
    const data = mockResponse(path, method);
    await route.fulfill({
      status: data.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: data.status && data.status >= 400 ? data.status : 0, message: data.message ?? 'ok', data: data.body })
    });
  });
});

test('login, list, publish viewer page and rollback path are wired', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await expect(page.getByText('仪表盘目录')).toBeVisible();
  await expect(page.getByText('销售总览')).toBeVisible();

  await page.getByRole('button', { name: /查\s*看/ }).click();
  await expect(page.getByRole('heading', { name: '销售总览' })).toBeVisible();

  await page.goto('/charts/1/edit');
  await page.getByRole('button', { name: '发布治理' }).click();
  await expect(page.getByRole('tab', { name: '版本' })).toBeVisible();
  await expect(page.getByText('v1')).toBeVisible();
});

function mockResponse(path: string, method: string): { status?: number; message?: string; body?: unknown } {
  if (path === '/auth/refresh') {
    return { body: { accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 1800, user } };
  }
  if (path === '/auth/login' && method === 'POST') {
    return { body: { accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 1800, user } };
  }
  if (path === '/auth/me') {
    return { body: user };
  }
  if (path === '/workspaces') {
    return { body: [{ id: 1, name: '默认工作空间', description: '', createdBy: 1, updatedBy: 1, createdAt: now(), updatedAt: now() }] };
  }
  if (path === '/projects') {
    return { body: [{ id: 1, workspaceId: 1, name: '默认项目', description: '', ownerId: 1, owner: user, createdBy: 1, updatedBy: 1, createdAt: now(), updatedAt: now() }] };
  }
  if (path === '/chart-groups') {
    return { body: [] };
  }
  if (path === '/chart-tags') {
    return { body: [] };
  }
  if (path === '/charts/creators') {
    return { body: [user] };
  }
  if (path === '/charts') {
    return { body: { items: [chart()], total: 1, page: 1, pageSize: 12 } };
  }
  if (path === '/charts/1') {
    return { body: chart() };
  }
  if (path === '/dashboards/1/published') {
    return { body: { chart: chart(), version: version(), runtimeRows: { widget_1: [{ month: '1月', revenue: 120 }] }, embed: false } };
  }
  if (path === '/charts/1/versions') {
    return { body: [version()] };
  }
  if (path === '/charts/1/audit-logs') {
    return { body: [{ id: 1, workspaceId: 1, projectId: 1, actorId: 1, actor: user, action: 'chart.publish', objectType: 'chart', objectId: 1, summary: '发布仪表盘', createdAt: now() }] };
  }
  if (path === '/charts/1/share-links' || path === '/charts/1/subscriptions') {
    return { body: [] };
  }
  return { body: {} };
}

function chart() {
  return {
    id: 1,
    workspaceId: 1,
    projectId: 1,
    ownerId: 1,
    name: '销售总览',
    description: '已发布仪表盘',
    type: 'line',
    status: 'published',
    groupId: null,
    group: null,
    config: {
      version: 2,
      widgets: [
        {
          id: 'widget_1',
          type: 'metricCard',
          x: 24,
          y: 24,
          width: 320,
          height: 180,
          config: {
            title: '收入',
            showLabel: true,
            showTooltip: true,
            showScrollbar: false,
            dimensions: ['month'],
            measures: ['revenue'],
            fieldLabels: { month: '月份', revenue: '收入' }
          }
        }
      ],
      filters: { timeFilter: { label: '日期', range: null }, dimensionControls: [] }
    },
    tags: [],
    createdBy: 1,
    updatedBy: 1,
    creator: user,
    updater: user,
    createdAt: now(),
    updatedAt: now()
  };
}

function version() {
  return {
    id: 1,
    chartId: 1,
    workspaceId: 1,
    projectId: 1,
    version: 1,
    name: '销售总览',
    description: '已发布仪表盘',
    type: 'line',
    config: chart().config,
    publishedBy: 1,
    publisher: user,
    createdAt: now()
  };
}

function now() {
  return new Date('2026-05-21T12:00:00+08:00').toISOString();
}
