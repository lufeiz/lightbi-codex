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
    const payload = route.request().postData() ? JSON.parse(route.request().postData() ?? '{}') : undefined;
    const data = mockResponse(path, method, url.searchParams, payload);
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
  await expect(page.getByText('筛选栏')).toBeVisible();
  await page.locator('.published-dashboard-filter-bar .filter-value-select').click();
  await page.locator('.ant-select-item-option', { hasText: '华东' }).click();
  await expect(page.getByText('区域：华东')).toBeVisible();
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page.getByText('区域：华东')).toHaveCount(0);

  await page.goto('/charts/1/edit');
  await page.getByRole('button', { name: '发布治理' }).click();
  await expect(page.getByRole('tab', { name: '版本' })).toBeVisible();
  await expect(page.getByText('v1')).toBeVisible();
});

test('published dashboard adapts desktop and mobile with render performance metrics', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as typeof window & { __lightbiMetrics?: Array<{ name: string; value: number }> };
    target.__lightbiMetrics = [];
    window.addEventListener('lightbi:performance', (event) => {
      target.__lightbiMetrics?.push((event as CustomEvent).detail);
    });
  });
  await page.route('**/api/public/shares/twelve-widget-token', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: apiEnvelope(twelveWidgetPublishedDashboard()) });
  });

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/share/twelve-widget-token');
  await expect(page.getByText(/刷新时间/)).toBeVisible();
  await expect.poll(async () =>
    page.evaluate(() => ((window as typeof window & { __lightbiMetrics?: Array<{ name: string }> }).__lightbiMetrics ?? []).filter((metric) => metric.name === 'CHART_RENDER').length)
  ).toBeGreaterThanOrEqual(12);

  const chartRenderValues = await page.evaluate(() =>
    ((window as typeof window & { __lightbiMetrics?: Array<{ name: string; value: number }> }).__lightbiMetrics ?? [])
      .filter((metric) => metric.name === 'CHART_RENDER')
      .map((metric) => metric.value)
      .sort((a, b) => a - b)
  );
  const p95 = chartRenderValues[Math.max(0, Math.ceil(chartRenderValues.length * 0.95) - 1)];
  console.info(`V6 CHART_RENDER P95 ${p95.toFixed(2)}ms`);
  expect(p95).toBeLessThanOrEqual(300);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.published-dashboard-mobile-list')).toBeVisible();
  await expect(page.locator('.published-widget-mobile')).toHaveCount(12);
  await expect(page.getByRole('button', { name: '清除筛选' })).toBeVisible();
  const widthState = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(widthState.scrollWidth).toBeLessThanOrEqual(widthState.clientWidth + 1);
});

test('viewer filter candidates use backend distinct values and show impact scope', async ({ page }) => {
  const distinctRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/datasets/1/distinct-values') {
      distinctRequests.push(url.search);
    }
  });

  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/dashboards/1');
  await expect(page.getByText('影响 1 个组件')).toBeVisible();
  await expect.poll(() => distinctRequests.length).toBeGreaterThan(0);
  expect(distinctRequests.at(-1)).toContain('field=region');

  await page.locator('.published-dashboard-filter-bar .filter-value-select').click();
  await page.locator('.ant-select-item-option', { hasText: '华北' }).click();
  await expect(page.getByText('区域：华北')).toBeVisible();
});

test('dashboard information architecture uses dashboard routes and metrics', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await expect(page.getByRole('link', { name: /仪表盘/ })).toBeVisible();
  await expect(page.getByText('首图类型')).toHaveCount(0);
  await expect(page.getByText('组件数')).toBeVisible();
  await expect(page.getByText('数据健康')).toBeVisible();

  await page.goto('/dashboards');
  await expect(page.getByText('销售总览')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboards$/);

  await page.goto('/dashboards/1/edit');
  await expect(page.getByPlaceholder('请输入仪表盘名称')).toHaveValue('销售总览');

  await page.goto('/charts/1/edit');
  await expect(page.getByPlaceholder('请输入仪表盘名称')).toHaveValue('销售总览');
});

test('editor can add a widget, configure dataset, update preview and save', async ({ page }) => {
  const previewQueryRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/datasets/1/query') {
      previewQueryRequests.push(request.postData() ?? '');
    }
  });

  await page.addInitScript(() => {
    const target = window as typeof window & {
      __lightbiMetrics?: Array<{ name: string; value: number }>;
      __lightbiLifecycle?: Array<{ renderer: string; action: string; chartType: string; widgetId: string }>;
    };
    target.__lightbiMetrics = [];
    target.__lightbiLifecycle = [];
    window.addEventListener('lightbi:performance', (event) => {
      target.__lightbiMetrics?.push((event as CustomEvent).detail);
    });
    window.addEventListener('lightbi:renderer-lifecycle', (event) => {
      target.__lightbiLifecycle?.push((event as CustomEvent).detail);
    });
  });

  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/charts/new');
  await expect(page.getByPlaceholder('请输入仪表盘名称')).toBeVisible();

  await page.getByRole('button', { name: '柱状图', exact: true }).click();
  await expect(page.getByText('配置数据源后点击更新图表')).toBeVisible();
  const widget = page.locator('.chart-widget').first();
  const box = await widget.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + 64, (box?.y ?? 0) + 52, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => ((window as typeof window & { __lightbiMetrics?: Array<{ name: string }> }).__lightbiMetrics ?? []).some((metric) => metric.name === 'EDITOR_INTERACTION'))).toBe(true);

  await page.locator('.data-source-module .ant-select').first().click();
  await page.getByTitle('标准数据集').click();
  await page.locator('.data-source-module .ant-select').nth(1).click();
  await page.getByTitle(/销售订单/).click();

  await page.locator('.field-token-dimensions', { hasText: '区域' }).dblclick();
  await page.locator('.field-token-measures', { hasText: '销售额' }).dblclick();
  await page.getByRole('button', { name: /更新图表/ }).click();

  await expect(page.getByText('已加载 2 条数据')).toBeVisible();
  expect(previewQueryRequests).toHaveLength(1);
  await expect.poll(async () => page.evaluate(() => ((window as typeof window & { __lightbiLifecycle?: Array<{ renderer: string; action: string }> }).__lightbiLifecycle ?? []).some((event) => event.renderer === 'g2' && event.action === 'init'))).toBe(true);
  const lifecycleCountAfterFirstPreview = await page.evaluate(() => ((window as typeof window & { __lightbiLifecycle?: unknown[] }).__lightbiLifecycle ?? []).length);
  await page.getByRole('button', { name: /更新图表/ }).click();
  await page.waitForTimeout(100);
  expect(previewQueryRequests).toHaveLength(1);
  await expect.poll(async () =>
    page.evaluate((startIndex) => {
      const lifecycle = (window as typeof window & { __lightbiLifecycle?: Array<{ renderer: string; action: string }> }).__lightbiLifecycle ?? [];
      return lifecycle.slice(startIndex).some((event) => event.renderer === 'g2' && event.action === 'update');
    }, lifecycleCountAfterFirstPreview)
  ).toBe(true);
  const destroyDuringPreviewUpdate = await page.evaluate(() => ((window as typeof window & { __lightbiLifecycle?: Array<{ action: string }> }).__lightbiLifecycle ?? []).some((event) => event.action === 'destroy'));
  expect(destroyDuringPreviewUpdate).toBe(false);
  const widgetScreenshot = await page.locator('.chart-widget').screenshot();
  expect(widgetScreenshot.length).toBeGreaterThan(1000);
  const metrics = await page.evaluate(() => (window as typeof window & { __lightbiMetrics?: Array<{ name: string; value: number }> }).__lightbiMetrics ?? []);
  expect(metrics.map((metric) => metric.name)).toContain('CHART_RENDER');
  expect(metrics.map((metric) => metric.name)).toContain('EDITOR_INTERACTION');
  expect(Math.max(...metrics.filter((metric) => metric.name === 'EDITOR_INTERACTION').map((metric) => metric.value))).toBeLessThanOrEqual(300);
  await page.getByRole('button', { name: /保存$/ }).click();
  await expect(page).toHaveURL(/\/dashboards\/2\/edit$/);
});

test('editor efficiency tools support copy undo redo align and undoable delete', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/charts/new');
  await page.getByRole('button', { name: '柱状图', exact: true }).click();
  await page.getByRole('button', { name: '折线图', exact: true }).click();
  await expect(page.locator('.chart-widget')).toHaveCount(2);

  await page.getByRole('button', { name: '复制' }).click();
  await expect(page.locator('.chart-widget')).toHaveCount(3);

  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.chart-widget')).toHaveCount(2);

  await page.getByRole('button', { name: '重做' }).click();
  await expect(page.locator('.chart-widget')).toHaveCount(3);

  await page.getByRole('button', { name: '左对齐' }).click();
  const leftPositions = await page.locator('.chart-widget').evaluateAll((nodes) =>
    nodes.map((node) => Number.parseInt((node as HTMLElement).style.left || '0', 10))
  );
  expect(leftPositions.at(-1)).toBe(Math.min(...leftPositions));

  await page.getByRole('button', { name: '删除' }).click();
  await expect(page.locator('.chart-widget')).toHaveCount(2);

  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.chart-widget')).toHaveCount(3);
});

test('query builder exposes grouped configuration flow and inline validation reasons', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/charts/new');
  await page.getByRole('button', { name: '柱状图', exact: true }).click();

  const builder = page.locator('.query-builder-flow');
  await expect(builder).toContainText('1 数据集');
  await expect(builder).toContainText('2 字段');
  await expect(builder).toContainText('3 聚合');
  await expect(builder).toContainText('4 过滤排序 TopN');
  await expect(builder).toContainText('5 样式');
  await expect(builder.locator('.preview-query-alert')).toContainText('请选择数据集');
  await expect(builder.locator('.preview-query-alert')).toContainText(/柱状图\s*至少需要 1 个维度/);
  await expect(builder.locator('.preview-query-alert')).toContainText(/柱状图\s*至少需要 1 个指标/);
});

test('editor can manage asset metadata and persist clean dashboard payload', async ({ page }) => {
  const savedPayloads: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/charts/1' && request.method() === 'PUT' && request.postData()) {
      savedPayloads.push(JSON.parse(request.postData() ?? '{}'));
    }
  });

  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/charts/1/edit');
  await page.getByRole('button', { name: '资产信息' }).click();
  await page.getByLabel('资产描述').fill('华东销售负责人每日复盘看板');
  await page.getByLabel('所属目录').click();
  await page.getByTitle('经营分析').click();
  await page.getByLabel('资产标签').click();
  await page.getByTitle('核心看板').click();
  await page.getByTitle('销售').click();
  await page.getByRole('button', { name: /完\s*成/ }).click();

  await page.getByRole('button', { name: /保存$/ }).click();
  expect(savedPayloads.at(-1)).toMatchObject({
    description: '华东销售负责人每日复盘看板',
    groupId: 1,
    tagIds: [1, 2]
  });
  expect(JSON.stringify(savedPayloads.at(-1))).not.toContain('previewRows');

  await page.goto('/charts');
  await page.locator('.filter-panel .ant-select').nth(2).click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { hasText: '经营分析' }).click();
  await page.locator('.filter-panel .ant-select').nth(3).click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { hasText: '核心看板' }).click();
  await page.getByRole('button', { name: /筛\s*选/ }).click();
  await expect(page.getByText('华东销售负责人每日复盘看板')).toBeVisible();
});

test('chart config accepts SQL metric card and dimension-only detail table preview', async ({ page }) => {
  const queryPayloads: unknown[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/api/datasets/') && url.pathname.endsWith('/query') && request.postData()) {
      queryPayloads.push(JSON.parse(request.postData() ?? '{}'));
    }
  });

  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/charts/new');
  await page.getByRole('button', { name: '指标看板', exact: true }).click();
  await page.locator('.data-source-module .ant-select').first().click();
  await page.getByTitle('SQL 数据集').click();
  await page.locator('.data-source-module .ant-select').nth(1).click();
  await page.getByTitle(/SQL 销售订单/).click();
  await page.locator('.field-token-measures', { hasText: '销售额' }).dblclick();
  await page.getByRole('button', { name: /更新图表/ }).click();

  await expect(page.getByText('已加载 1 条数据')).toBeVisible();
  expect(queryPayloads.at(-1)).toMatchObject({
    dimensions: [],
    metrics: [{ field: 'revenue', aggregation: 'sum', alias: 'revenue' }]
  });

  await page.getByRole('button', { name: '明细表', exact: true }).click();
  await page.locator('.data-source-module .ant-select').first().click();
  await page.getByTitle('标准数据集').click();
  await page.locator('.data-source-module .ant-select').nth(1).click();
  await page.getByTitle(/销售订单/).click();
  await page.locator('.field-token-dimensions', { hasText: '区域' }).dblclick();
  await page.getByRole('button', { name: /更新图表/ }).click();

  await expect(page.getByText('已加载 2 条数据')).toBeVisible();
  expect(queryPayloads.at(-1)).toMatchObject({
    dimensions: ['region'],
    metrics: []
  });
});

test('invalid chart config cannot be saved and shows a concrete reason', async ({ page }) => {
  const createRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/charts' && request.method() === 'POST') {
      createRequests.push(request.postData() ?? '');
    }
  });

  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/charts/new');
  await page.getByRole('button', { name: '折线图', exact: true }).click();
  await page.getByRole('button', { name: /保存$/ }).click();

  await expect(page.getByText(/第 1 个组件缺少数据集/)).toBeVisible();
  expect(createRequests).toHaveLength(0);
});

test('dataset creation can test SQL, infer fields and save confirmed schema', async ({ page }) => {
  const createDatasetPayloads: unknown[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/datasets' && request.method() === 'POST' && request.postData()) {
      createDatasetPayloads.push(JSON.parse(request.postData() ?? '{}'));
    }
  });

  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/datasets');
  await page.getByRole('button', { name: '新建数据集' }).click();
  const wizardSteps = page.locator('.dataset-wizard-steps .ant-steps-item');
  await expect(page.locator('.dataset-wizard-steps')).toContainText('选择数据源');
  await expect(page.locator('.dataset-wizard-steps')).toContainText('SQL 测试');
  await expect(page.locator('.dataset-wizard-steps')).toContainText('字段识别');
  await expect(page.locator('.dataset-wizard-steps')).toContainText('字段确认');
  await expect(page.locator('.dataset-wizard-steps')).toContainText('保存配置');
  expect(await wizardSteps.count()).toBeLessThanOrEqual(5);

  await page.getByRole('textbox', { name: '* 名称' }).fill('SQL 自动识别');
  await page.locator('.asset-form .ant-select').nth(1).click();
  await page.getByTitle(/MySQL 分析库/).click();
  await page.getByRole('button', { name: /下\s*一\s*步/ }).click();

  await page.getByLabel('只读 SQL').fill('SELECT region, revenue FROM orders');
  await page.getByRole('button', { name: '测试 SQL 并识别字段' }).click();
  await expect(page.locator('.dataset-preview-table')).toContainText('华东');
  await page.getByRole('button', { name: /下\s*一\s*步/ }).click();

  await expect(page.locator('.dataset-field-confirm-table')).toContainText('region');
  await expect(page.locator('.dataset-field-confirm-table')).toContainText('revenue');
  await page.getByRole('button', { name: /下\s*一\s*步/ }).click();

  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect.poll(() => createDatasetPayloads.length).toBeGreaterThan(0);
  expect(createDatasetPayloads.at(-1)).toMatchObject({
    name: 'SQL 自动识别',
    dimensions: [{ name: 'region', label: 'region', type: 'string' }],
    measures: [{ name: 'revenue', label: 'revenue', type: 'number' }]
  });
});

test('share governance can create copy edit disable expire and delete links', async ({ page }) => {
  const createdPayloads: Array<Record<string, unknown>> = [];
  const updatedPayloads: Array<Record<string, unknown>> = [];
  const deletedIds: number[] = [];
  const shareLinkRows: Array<Record<string, unknown>> = [
    {
      id: 9,
      chartId: 1,
      name: '过期链接',
      token: 'expired-token',
      tokenPrefix: 'expired-',
      enabled: true,
      allowEmbed: false,
      expiresAt: '2026-06-10T00:00:00+08:00',
      createdAt: now(),
      updatedAt: now()
    }
  ];

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as typeof window & { __copiedText?: string }).__copiedText = text;
        }
      }
    });
  });

  await page.route('**/api/charts/1/share-links**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const id = Number(url.pathname.split('/').at(-1));
    if (method === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: apiEnvelope(shareLinkRows) });
      return;
    }
    if (method === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      createdPayloads.push(payload);
      const row = {
        id: 10,
        chartId: 1,
        token: 'new-share-token',
        tokenPrefix: 'new-shar',
        createdAt: now(),
        updatedAt: now(),
        ...payload
      };
      shareLinkRows.unshift(row);
      await route.fulfill({ status: 201, contentType: 'application/json', body: apiEnvelope(row) });
      return;
    }
    if (method === 'PUT') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      updatedPayloads.push(payload);
      const index = shareLinkRows.findIndex((row) => row.id === id);
      shareLinkRows[index] = { ...shareLinkRows[index], ...payload, updatedAt: now() };
      await route.fulfill({ contentType: 'application/json', body: apiEnvelope(shareLinkRows[index]) });
      return;
    }
    if (method === 'DELETE') {
      deletedIds.push(id);
      const index = shareLinkRows.findIndex((row) => row.id === id);
      if (index >= 0) {
        shareLinkRows.splice(index, 1);
      }
      await route.fulfill({ contentType: 'application/json', body: apiEnvelope({ deleted: true }) });
      return;
    }
    await route.fallback();
  });

  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('admin');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/charts/1/edit');
  await page.getByRole('button', { name: '发布治理' }).click();
  await page.getByRole('tab', { name: '分享' }).click();
  await expect(page.locator('.share-link-table')).toContainText('过期链接');
  await expect(page.locator('.share-link-table')).toContainText('已过期');

  await page.getByPlaceholder('链接名称').fill('客户分享');
  await page.getByLabel('过期时间').fill('2026-07-01 00:00:00');
  await page.locator('.share-create-form .ant-switch').nth(1).click();
  await page.getByRole('button', { name: '创建' }).click();
  await expect(page.locator('.share-link-table')).toContainText('客户分享');
  expect(createdPayloads.at(-1)).toMatchObject({ name: '客户分享', enabled: true, allowEmbed: true });
  expect(String(createdPayloads.at(-1)?.expiresAt)).toContain('2026-06-30');

  const newShareRow = page.locator('.share-link-table .ant-table-row', { hasText: '客户分享' });
  await newShareRow.getByRole('button', { name: '复制 URL' }).click();
  expect(await page.evaluate(() => (window as typeof window & { __copiedText?: string }).__copiedText)).toContain('/share/new-share-token');
  await newShareRow.getByRole('button', { name: '复制 embed code' }).click();
  expect(await page.evaluate(() => (window as typeof window & { __copiedText?: string }).__copiedText)).toContain('/embed/new-share-token');

  await newShareRow.getByRole('button', { name: '编辑' }).click();
  const editModal = page.getByRole('dialog', { name: '编辑分享链接' });
  await editModal.getByLabel('分享名称').fill('客户分享停用');
  await expect(editModal.getByLabel('分享名称')).toHaveValue('客户分享停用');
  await editModal.locator('.ant-switch').first().click();
  await page.getByRole('button', { name: '确 定' }).click();
  await expect(page.locator('.share-link-table')).toContainText('客户分享停用');
  await expect(page.locator('.share-link-table')).toContainText('停用');
  expect(updatedPayloads.at(-1)).toMatchObject({ name: '客户分享停用', enabled: false, allowEmbed: true });

  const expiredRow = page.locator('.share-link-table .ant-table-row', { hasText: '过期链接' });
  await expiredRow.getByRole('button', { name: '删除' }).click();
  await page.getByRole('button', { name: '确 定' }).click();
  await expect(page.locator('.share-link-table')).not.toContainText('过期链接');
  expect(deletedIds).toContain(9);
});

test('viewer sees explicit write-disabled reasons on core create buttons', async ({ page }) => {
  const viewer = { ...user, role: 'viewer' };
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: { accessToken: 'viewer-token', tokenType: 'Bearer', expiresIn: 1800, user: viewer } }) });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: viewer }) });
  });
  await page.route('**/api/projects/1/members', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [{ id: 1, projectId: 1, userId: viewer.id, role: 'viewer', user: viewer, createdAt: now(), updatedAt: now() }]
      })
    });
  });

  await page.goto('/login');
  await page.getByLabel('账号 / 邮箱 / 手机号').fill('viewer');
  await page.getByLabel('密码').fill('LightBI@123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await page.goto('/charts');
  await expect(page.getByText('当前项目无写权限')).toBeVisible();
  await expect(page.getByRole('button', { name: '创建仪表盘' })).toBeDisabled();

  await page.goto('/data-sources');
  await expect(page.getByText('当前项目无写权限')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建数据源' })).toBeDisabled();

  await page.goto('/datasets');
  await expect(page.getByText('当前项目无写权限')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建数据集' })).toBeDisabled();
});

function mockResponse(path: string, method: string, searchParams = new URLSearchParams(), payload?: unknown): { status?: number; message?: string; body?: unknown } {
  if (path === '/auth/refresh') {
    return { body: { accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 1800, user } };
  }
  if (path === '/auth/login' && method === 'POST') {
    return { body: { accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 1800, user } };
  }
  if (path === '/auth/me') {
    return { body: user };
  }
  if (path === '/users') {
    return { body: [user] };
  }
  if (path === '/workspaces') {
    return { body: [{ id: 1, name: '默认工作空间', description: '', createdBy: 1, updatedBy: 1, createdAt: now(), updatedAt: now() }] };
  }
  if (path === '/projects') {
    return { body: [{ id: 1, workspaceId: 1, name: '默认项目', description: '', ownerId: 1, owner: user, createdBy: 1, updatedBy: 1, createdAt: now(), updatedAt: now() }] };
  }
  if (path === '/projects/1/members') {
    return { body: [{ id: 1, projectId: 1, userId: user.id, role: 'owner', user, createdAt: now(), updatedAt: now() }] };
  }
  if (path === '/chart-groups') {
    return {
      body: [
        {
          id: 1,
          workspaceId: 1,
          projectId: 1,
          ownerId: 1,
          parentId: null,
          name: '经营分析',
          sortOrder: 0,
          createdBy: 1,
          updatedBy: 1,
          createdAt: now(),
          updatedAt: now()
        }
      ]
    };
  }
  if (path === '/chart-tags') {
    return {
      body: [
        {
          id: 1,
          workspaceId: 1,
          projectId: 1,
          ownerId: 1,
          name: '核心看板',
          color: '#1677ff',
          createdBy: 1,
          updatedBy: 1,
          createdAt: now(),
          updatedAt: now()
        },
        {
          id: 2,
          workspaceId: 1,
          projectId: 1,
          ownerId: 1,
          name: '销售',
          color: '#52c41a',
          createdBy: 1,
          updatedBy: 1,
          createdAt: now(),
          updatedAt: now()
        }
      ]
    };
  }
  if (path === '/charts/creators') {
    return { body: [user] };
  }
  if (path === '/charts' && method === 'POST') {
    return { body: chart(2, 'draft') };
  }
  if (path === '/charts/1' && method === 'PUT') {
    return { body: chart(1, 'draft') };
  }
  if (path === '/charts') {
    return { body: { items: [chart()], total: 1, page: 1, pageSize: 12 } };
  }
  if (path === '/charts/1') {
    return { body: chart() };
  }
  if (path === '/charts/2') {
    return { body: chart(2, 'draft') };
  }
  if (path === '/data-sources') {
    return {
      body: [
        {
          id: 1,
          workspaceId: 1,
          projectId: 1,
          ownerId: 1,
          name: 'MySQL 分析库',
          type: 'mysql',
          host: 'db.lightbi.local',
          port: 3306,
          databaseName: 'bi',
          username: 'readonly',
          status: 'active',
          createdAt: now(),
          updatedAt: now()
        }
      ]
    };
  }
  if (path === '/datasets' && method === 'POST') {
    return { body: { id: 3, name: 'SQL 自动识别', type: 'sql', sourceName: 'MySQL 分析库', createdAt: now(), updatedAt: now() } };
  }
  if (path === '/datasets') {
    const type = searchParams.get('type');
    const datasets = [
      {
        id: 1,
        workspaceId: 1,
        projectId: 1,
        name: '销售订单',
        type: 'standard',
        sourceName: '标准数据集',
        createdAt: now(),
        updatedAt: now()
      },
      {
        id: 2,
        workspaceId: 1,
        projectId: 1,
        name: 'SQL 销售订单',
        type: 'sql',
        sourceName: 'MySQL 分析库',
        createdAt: now(),
        updatedAt: now()
      }
    ];
    return {
      body: type ? datasets.filter((dataset) => dataset.type === type) : datasets
    };
  }
  if (path === '/datasets/preview' && method === 'POST') {
    return {
      body: {
        columns: [
          { name: 'region', label: 'region', role: 'dimension', type: 'string' },
          { name: 'revenue', label: 'revenue', role: 'measure', type: 'number' }
        ],
        rows: [
          { region: '华东', revenue: 120 },
          { region: '华南', revenue: 96 }
        ],
        cached: false,
        executedAt: now()
      }
    };
  }
  if (path === '/datasets/1/fields') {
    return {
      body: {
        dimensions: [
          { name: 'region', label: '区域', type: 'string' },
          { name: 'month', label: '月份', type: 'string' }
        ],
        measures: [
          { name: 'revenue', label: '销售额', type: 'number' },
          { name: 'profit', label: '利润', type: 'number' }
        ]
      }
    };
  }
  if (path === '/datasets/1/query' && method === 'POST') {
    const query = payload as { metrics?: unknown[] } | undefined;
    const includeMetric = Boolean(query?.metrics?.length);
    return {
      body: {
        columns: [
          { name: 'region', label: '区域', role: 'dimension', type: 'string' },
          ...(includeMetric ? [{ name: 'revenue', label: '销售额', role: 'measure', type: 'number' }] : [])
        ],
        rows: [
          includeMetric ? { region: '华东', revenue: 120 } : { region: '华东' },
          includeMetric ? { region: '华南', revenue: 96 } : { region: '华南' }
        ],
        cached: false,
        executedAt: now()
      }
    };
  }
  if (path === '/datasets/1/distinct-values') {
    return {
      body: {
        field: searchParams.get('field') ?? 'region',
        values: ['华北', '华东'],
        total: 3,
        truncated: true
      }
    };
  }
  if (path === '/datasets/2/fields') {
    return {
      body: {
        dimensions: [
          { name: 'region', label: '区域', type: 'string' },
          { name: 'month', label: '月份', type: 'string' }
        ],
        measures: [
          { name: 'revenue', label: '销售额', type: 'number' },
          { name: 'orders', label: '订单数', type: 'number' }
        ]
      }
    };
  }
  if (path === '/datasets/2/query' && method === 'POST') {
    return {
      body: {
        columns: [{ name: 'revenue', label: '销售额', role: 'measure', type: 'number' }],
        rows: [{ revenue: 216 }],
        cached: false,
        executedAt: now()
      }
    };
  }
  if (path === '/dashboards/1/published') {
    return {
      body: {
        chart: publishedChart(),
        version: version(),
        runtimeRows: { widget_1: [{ region: '华东', revenue: 120 }, { region: '华南', revenue: 96 }] },
        runtimeStatus: { widget_1: runtimeStatus('widget_1') },
        embed: false
      }
    };
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

function apiEnvelope(data: unknown, status = 0) {
  return JSON.stringify({ code: status, message: 'ok', data });
}

function publishedChart() {
  const source = chart();
  return {
    id: source.id,
    name: source.name,
    description: source.description,
    type: source.type,
    status: source.status,
    config: source.config,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
}

function twelveWidgetPublishedDashboard() {
  const source = publishedChart();
  const widgets = Array.from({ length: 12 }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    return {
      ...source.config.widgets[0],
      id: `widget_${index + 1}`,
      type: 'column',
      x: 24 + column * 280,
      y: 24 + row * 210,
      width: 260,
      height: 180,
      config: {
        ...source.config.widgets[0].config,
        title: `销售趋势 ${index + 1}`,
        datasetId: 1,
        datasetName: '销售订单',
        dimensions: ['region'],
        measures: ['revenue'],
        query: {
          dimensions: ['region'],
          metrics: [{ field: 'revenue', aggregation: 'sum', alias: 'revenue' }],
          filters: [],
          sorts: [],
          limit: 500,
          timeComparison: 'none'
        },
        fieldLabels: { region: '区域', revenue: '销售额' }
      }
    };
  });
  const runtimeRows = Object.fromEntries(
    widgets.map((widget, index) => [
      widget.id,
      [
        { region: '华东', revenue: 120 + index },
        { region: '华南', revenue: 96 + index }
      ]
    ])
  );
  return {
    chart: {
      ...source,
      config: {
        ...source.config,
        widgets,
        filters: {
          ...source.config.filters,
          dimensionControls: [
            {
              id: 'filter-region',
              label: '区域',
              chartIds: widgets.map((widget) => widget.id),
              field: 'region',
              fieldsByChart: Object.fromEntries(widgets.map((widget) => [widget.id, 'region'])),
              values: []
            }
          ]
        }
      }
    },
    version: version(),
    runtimeRows,
    runtimeStatus: Object.fromEntries(widgets.map((widget) => [widget.id, runtimeStatus(widget.id)])),
    embed: false
  };
}

function runtimeStatus(widgetId: string) {
  return {
    widgetId,
    status: 'success',
    cached: false,
    rowCount: 2,
    durationMs: 24,
    message: '数据加载成功',
    executedAt: now()
  };
}

function chart(id = 1, status = 'published') {
  return {
    id,
    workspaceId: 1,
    projectId: 1,
    ownerId: 1,
    name: '销售总览',
    description: '华东销售负责人每日复盘看板',
    type: 'line',
    status,
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
            datasetId: 1,
            datasetName: '销售订单',
            dimensions: ['region'],
            measures: ['revenue'],
            query: {
              dimensions: ['region'],
              metrics: [{ field: 'revenue', aggregation: 'sum', alias: 'revenue' }],
              filters: [],
              sorts: [],
              limit: 500,
              timeComparison: 'none'
            },
            fieldLabels: { region: '区域', revenue: '收入' },
            previewRows: [{ region: '华东', revenue: 120 }]
          }
        }
      ],
      filters: {
        timeFilter: { label: '日期', range: null },
        dimensionControls: [
          {
            id: 'filter-region',
            label: '区域',
            chartIds: ['widget_1'],
            field: 'region',
            fieldsByChart: { widget_1: 'region' },
            values: []
          }
        ]
      }
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
