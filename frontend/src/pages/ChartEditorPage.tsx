import { AlignLeftOutlined, CopyOutlined, DeleteOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Form, Input, message, Select, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '@/api/client';
import { ChartConfigPanel } from '@/features/charts/ChartConfigPanel';
import { DashboardGovernancePanel } from '@/features/charts/DashboardGovernancePanel';
import { DashboardFilterBar } from '@/features/charts/DashboardFilterBar';
import { DesignerCanvas } from '@/features/charts/DesignerCanvas';
import { validateChartDocument } from '@/features/charts/chartConfigValidation';
import { chartTypeGroups, groupToSelectOptions } from '@/features/charts/chartUtils';
import { useAuthStore } from '@/store/authStore';
import { useDesignerStore } from '@/store/designerStore';
import { useEditorToolbarStore } from '@/store/editorToolbarStore';
import { hasProjectWriteAccess, useWorkspaceStore } from '@/store/workspaceStore';
import type { ChartGroup, ChartMutationPayload, ChartStatus, ChartTag, ChartType } from '@/types/domain';
import { chartTypeLabels } from '@/types/domain';

interface AssetInfoFormValues {
  description: string;
  groupId: number | null;
  tagIds: number[];
}

export function ChartEditorPage() {
  const navigate = useNavigate();
  const params = useParams();
  const chartId = params.id ? Number(params.id) : undefined;
  const [assetForm] = Form.useForm<AssetInfoFormValues>();
  const [loading, setLoading] = useState(Boolean(chartId));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [dataSourceCollapsed, setDataSourceCollapsed] = useState(false);
  const [assetInfoOpen, setAssetInfoOpen] = useState(false);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [groups, setGroups] = useState<ChartGroup[]>([]);
  const [tags, setTags] = useState<ChartTag[]>([]);
  const user = useAuthStore((state) => state.user);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectRole = useWorkspaceStore((state) => state.projectRole);
  const canWrite = hasProjectWriteAccess(user, projectRole);
  const meta = useDesignerStore((state) => state.meta);
  const widgets = useDesignerStore((state) => state.widgets);
  const selectedWidgetId = useDesignerStore((state) => state.selectedWidgetId);
  const canUndo = useDesignerStore((state) => state.historyPast.length > 0);
  const canRedo = useDesignerStore((state) => state.historyFuture.length > 0);
  const reset = useDesignerStore((state) => state.reset);
  const load = useDesignerStore((state) => state.load);
  const setMeta = useDesignerStore((state) => state.setMeta);
  const addWidget = useDesignerStore((state) => state.addWidget);
  const deleteWidget = useDesignerStore((state) => state.deleteWidget);
  const duplicateSelectedWidget = useDesignerStore((state) => state.duplicateSelectedWidget);
  const alignSelectedWidget = useDesignerStore((state) => state.alignSelectedWidget);
  const undo = useDesignerStore((state) => state.undo);
  const redo = useDesignerStore((state) => state.redo);
  const toPayload = useDesignerStore((state) => state.toPayload);
  const setToolbar = useEditorToolbarStore((state) => state.setToolbar);
  const clearToolbar = useEditorToolbarStore((state) => state.clearToolbar);
  const scope = useMemo(() => ({ workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined }), [projectId, workspaceId]);
  const groupOptions = useMemo(() => groupToSelectOptions(groups), [groups]);
  const tagOptions = useMemo(() => tags.map((tag) => ({ value: tag.id, label: tag.name })), [tags]);

  const fetchAssetDictionaries = useCallback(async () => {
    try {
      const [groupData, tagData] = await Promise.all([api.groups(scope), api.tags(scope)]);
      setGroups(groupData);
      setTags(tagData);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载资产信息选项失败');
      setGroups([]);
      setTags([]);
    }
  }, [scope]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (chartId) {
        const chart = await api.chart(chartId);
        load({
          id: chart.id,
          name: chart.name,
          description: chart.description,
          status: chart.status,
          groupId: chart.groupId,
          tagIds: chart.tags.map((tag) => tag.id),
          type: chart.type,
          config: chart.config
        });
      } else {
        reset();
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载编辑器失败');
    } finally {
      setLoading(false);
    }
  }, [chartId, load, reset]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    void fetchAssetDictionaries();
  }, [fetchAssetDictionaries]);

  const handleDashboardNameBlur = () => {
    if (!meta.name.trim()) {
      setMeta({ name: '未命名仪表盘' });
    }
  };

  const handleAddWidget = (type: ChartType) => {
    addWidget(type);
  };

  const openAssetInfo = () => {
    assetForm.setFieldsValue({
      description: meta.description,
      groupId: meta.groupId,
      tagIds: meta.tagIds
    });
    setAssetInfoOpen(true);
  };

  const submitAssetInfo = async () => {
    const values = await assetForm.validateFields();
    setMeta({
      description: values.description ?? '',
      groupId: values.groupId ?? null,
      tagIds: values.tagIds ?? []
    });
    setAssetInfoOpen(false);
  };

  const warnIfPublishingUngovernedAsset = (statusOverride?: ChartStatus) => {
    if (statusOverride === 'published' && (!meta.groupId || meta.tagIds.length === 0)) {
      message.warning('建议发布前补充目录和标签，方便后续治理与复用');
    }
  };

  const buildMutationPayload = useCallback((statusOverride?: ChartStatus): ChartMutationPayload | null => {
    if (!canWrite) {
      message.warning('当前角色只读，不能保存仪表盘');
      return null;
    }
    if (!meta.name.trim()) {
      message.warning('请输入仪表盘名称');
      return null;
    }
    if (widgets.length === 0) {
      message.warning('请至少添加一个图表');
      return null;
    }
    if (!chartId && (!workspaceId || !projectId)) {
      message.warning('请先选择工作空间和项目');
      return null;
    }
    const payload = toPayload();
    const configErrors = validateChartDocument(payload.config);
    if (configErrors.length) {
      message.error(configErrors.slice(0, 3).join('；'));
      return null;
    }
    if (!chartId) {
      payload.workspaceId = workspaceId ?? undefined;
      payload.projectId = projectId ?? undefined;
    }
    if (statusOverride) {
      payload.status = statusOverride;
    }
    warnIfPublishingUngovernedAsset(statusOverride);
    return payload;
  }, [canWrite, chartId, meta.groupId, meta.name, meta.tagIds.length, projectId, toPayload, widgets.length, workspaceId]);

  const saveDashboard = useCallback(async (statusOverride?: ChartStatus) => {
    const payload = buildMutationPayload(statusOverride);
    if (!payload) {
      return null;
    }
    const saved = chartId ? await api.updateChart(chartId, payload) : await api.createChart(payload);
    if (statusOverride) {
      setMeta({ status: statusOverride });
    }
    if (!chartId) {
      navigate(`/dashboards/${saved.id}/edit`, { replace: true });
    }
    return saved;
  }, [buildMutationPayload, chartId, navigate, setMeta]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await saveDashboard();
      if (saved) {
        message.success('仪表盘已保存');
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存仪表盘失败');
    } finally {
      setSaving(false);
    }
  }, [saveDashboard]);

  const handlePublish = useCallback(async () => {
    if (!canWrite) {
      message.warning('当前角色只读，不能发布仪表盘');
      return;
    }
    setPublishing(true);
    try {
      const payload = buildMutationPayload('published');
      if (!payload) {
        return;
      }
      if (chartId) {
        await api.publishChart(chartId, payload);
        setMeta({ status: 'published' });
      } else {
        const saved = await api.createChart(payload);
        setMeta({ status: 'published' });
        navigate(`/dashboards/${saved.id}/edit`, { replace: true });
      }
      message.success('仪表盘已发布');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '发布仪表盘失败');
    } finally {
      setPublishing(false);
    }
  }, [buildMutationPayload, canWrite, chartId, navigate, setMeta]);

  const handleSaveAndPublish = useCallback(async () => {
    setSaving(true);
    try {
      const payload = buildMutationPayload('published');
      if (!payload) {
        return;
      }
      if (chartId) {
        await api.publishChart(chartId, payload);
        setMeta({ status: 'published' });
      } else {
        const saved = await api.createChart(payload);
        setMeta({ status: 'published' });
        navigate(`/dashboards/${saved.id}/edit`, { replace: true });
      }
      message.success('仪表盘已保存并发布');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存并发布失败');
    } finally {
      setSaving(false);
    }
  }, [buildMutationPayload, chartId, navigate, setMeta]);

  useEffect(() => {
    if (loading) {
      clearToolbar();
      return;
    }

    setToolbar({
      visible: true,
      statusLabel: meta.status === 'published' ? '已发布' : meta.status === 'archived' ? '已归档' : '草稿',
      canWrite,
      saving,
      publishing,
      onSave: () => {
        void handleSave();
      },
      onPublish: () => {
        void handlePublish();
      },
      onSaveAndPublish: () => {
        void handleSaveAndPublish();
      }
    });

    return clearToolbar;
  }, [canWrite, clearToolbar, handlePublish, handleSave, handleSaveAndPublish, loading, meta.status, publishing, saving, setToolbar]);

  if (loading) {
    return (
      <div className="route-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="editor-page">
      {loadError && <Alert type="error" showIcon message={loadError} />}
      <header className="editor-header">
        <div className="dashboard-title-editor">
          <Input
            className="dashboard-name-input"
            value={meta.name}
            disabled={!canWrite}
            placeholder="请输入仪表盘名称"
            onChange={(event) => setMeta({ name: event.target.value })}
            onBlur={handleDashboardNameBlur}
          />
        </div>
        <Space className="editor-tool-actions" wrap>
          <Button icon={<UndoOutlined />} disabled={!canWrite || !canUndo} onClick={undo}>
            撤销
          </Button>
          <Button icon={<RedoOutlined />} disabled={!canWrite || !canRedo} onClick={redo}>
            重做
          </Button>
          <Button icon={<CopyOutlined />} disabled={!canWrite || !selectedWidgetId} onClick={duplicateSelectedWidget}>
            复制
          </Button>
          <Button icon={<AlignLeftOutlined />} disabled={!canWrite || !selectedWidgetId || widgets.length < 2} onClick={() => alignSelectedWidget('left')}>
            左对齐
          </Button>
          <Button danger icon={<DeleteOutlined />} disabled={!canWrite || !selectedWidgetId} onClick={() => selectedWidgetId && deleteWidget(selectedWidgetId)}>
            删除
          </Button>
          <Button onClick={openAssetInfo}>
            资产信息
          </Button>
          {chartId && (
            <Button onClick={() => setGovernanceOpen(true)}>
              发布治理
            </Button>
          )}
        </Space>
      </header>
      <DashboardFilterBar />

      <div
        className={[
          'editor-layout',
          configCollapsed ? 'editor-layout-config-collapsed' : '',
          dataSourceCollapsed ? 'editor-layout-data-collapsed' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <aside className="chart-type-sidebar" aria-label="图表组件区">
          <Space direction="vertical" size={14} className="chart-type-sidebar-body">
            {chartTypeGroups.map((group) => (
              <section key={group.key} className="chart-type-group">
                <Typography.Title level={5}>{group.title}</Typography.Title>
                <div className="chart-type-button-grid">
                  {group.types.map((type) => (
                    <Button
                      key={type}
                      className="palette-button"
                      icon={<ChartTypeIcon type={type} />}
                      disabled={!canWrite}
                      onClick={() => handleAddWidget(type)}
                    >
                      {chartTypeLabels[type]}
                    </Button>
                  ))}
                </div>
              </section>
            ))}
          </Space>
        </aside>
        <div className="editor-canvas-shell">
          <DesignerCanvas />
        </div>

        <aside className="inspector-panel">
          <ChartConfigPanel
            configCollapsed={configCollapsed}
            dataSourceCollapsed={dataSourceCollapsed}
            onConfigCollapsedChange={setConfigCollapsed}
            onDataSourceCollapsedChange={setDataSourceCollapsed}
          />
        </aside>
      </div>
      <Drawer
        width={480}
        title="资产信息"
        open={assetInfoOpen}
        onClose={() => setAssetInfoOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setAssetInfoOpen(false)}>取消</Button>
            <Button type="primary" disabled={!canWrite} onClick={() => void submitAssetInfo()}>
              完成
            </Button>
          </Space>
        }
      >
        <Form<AssetInfoFormValues> form={assetForm} layout="vertical" className="asset-info-form">
          <Form.Item name="description" label="资产描述">
            <Input.TextArea rows={4} placeholder="补充仪表盘用途、负责人或业务口径" disabled={!canWrite} />
          </Form.Item>
          <Form.Item name="groupId" label="所属目录">
            <Select allowClear placeholder="选择目录" options={groupOptions} disabled={!canWrite} />
          </Form.Item>
          <Form.Item name="tagIds" label="资产标签">
            <Select mode="multiple" allowClear placeholder="选择标签" options={tagOptions} disabled={!canWrite} />
          </Form.Item>
          {(!meta.groupId || meta.tagIds.length === 0) && (
            <Alert type="warning" showIcon message="发布前建议补充目录和标签，方便治理、筛选和复用。" />
          )}
        </Form>
      </Drawer>
      <DashboardGovernancePanel chartId={chartId} open={governanceOpen} onOpenChange={setGovernanceOpen} onRollback={bootstrap} />
    </div>
  );
}

function ChartTypeIcon({ type }: { type: ChartType }) {
  if (type === 'metricCard' || type === 'metricTrendCard') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#ecfdf5" />
          <path d="M8 18.5h12" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M8 13h7" stroke="#1677ff" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M18 10l3 3-3 3" fill="none" stroke="#9254de" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (type === 'line') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#eef6ff" />
          <path d="M6 19l5-5 4 3 7-8" fill="none" stroke="#1677ff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6" cy="19" r="2" fill="#36cfc9" />
          <circle cx="15" cy="17" r="2" fill="#9254de" />
          <circle cx="22" cy="9" r="2" fill="#ff7a45" />
        </svg>
      </span>
    );
  }

  if (type === 'pie' || type === 'donut') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#fff7e6" />
          <path d="M14 6a8 8 0 018 8h-8z" fill="#1677ff" />
          <path d="M22 14a8 8 0 01-11.6 7.1L14 14z" fill="#52c41a" />
          <path d="M10.4 21.1A8 8 0 0114 6v8z" fill="#fa8c16" />
          {type === 'donut' && <circle cx="14" cy="14" r="3.2" fill="#fff7e6" />}
        </svg>
      </span>
    );
  }

  if (type === 'bar' || type === 'stackedBar' || type === 'percentStackedBar') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#f6ffed" />
          <rect x="7" y="8" width={type === 'bar' ? 14 : 7} height="4" rx="2" fill="#36cfc9" />
          {type !== 'bar' && <rect x="14" y="8" width="7" height="4" rx="2" fill="#1677ff" />}
          <rect x="7" y="13" width={type === 'bar' ? 10 : 6} height="4" rx="2" fill="#1677ff" />
          {type !== 'bar' && <rect x="13" y="13" width="8" height="4" rx="2" fill="#9254de" />}
          <rect x="7" y="18" width={type === 'bar' ? 16 : 8} height="4" rx="2" fill="#9254de" />
          {type !== 'bar' && <rect x="15" y="18" width="8" height="4" rx="2" fill="#fa8c16" />}
        </svg>
      </span>
    );
  }

  if (type === 'column' || type === 'stackedColumn' || type === 'percentStackedColumn') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#f0f5ff" />
          <rect x="7" y="14" width="4" height="7" rx="1.5" fill="#36cfc9" />
          {type !== 'column' && <rect x="7" y="9" width="4" height="5" rx="1.5" fill="#1677ff" />}
          <rect x="12" y="10" width="4" height="11" rx="1.5" fill="#1677ff" />
          {type !== 'column' && <rect x="12" y="6" width="4" height="4" rx="1.5" fill="#9254de" />}
          <rect x="17" y="7" width="4" height="14" rx="1.5" fill="#9254de" />
          {type !== 'column' && <rect x="17" y="4" width="4" height="3" rx="1.5" fill="#fa8c16" />}
        </svg>
      </span>
    );
  }

  if (type === 'comparisonTable') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#fff1f0" />
          <rect x="7" y="8" width="6" height="12" rx="2" fill="#ff7a45" />
          <rect x="15" y="11" width="6" height="9" rx="2" fill="#1677ff" />
          <path d="M7 21h14" stroke="#8c8c8c" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (type === 'text' || type === 'richText') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#f0fdfa" />
          <rect x="8" y="7" width="12" height="3" rx="1.5" fill="#14b8a6" />
          <path d="M14 10v11" stroke="#1677ff" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M9 21h10" stroke="#9254de" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="21" cy="8" r="2.4" fill="#ff7a45" />
        </svg>
      </span>
    );
  }

  return (
    <span className="chart-type-icon" aria-hidden="true">
      <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
        <rect x="3" y="3" width="22" height="22" rx="6" fill="#f9f0ff" />
        <rect x="7" y="8" width="14" height="3" rx="1.5" fill="#1677ff" />
        <rect x="7" y="13" width="5" height="3" rx="1.5" fill="#36cfc9" />
        <rect x="14" y="13" width="7" height="3" rx="1.5" fill="#52c41a" />
        <rect x="7" y="18" width="14" height="3" rx="1.5" fill="#9254de" />
      </svg>
    </span>
  );
}
