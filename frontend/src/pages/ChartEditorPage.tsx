import { Alert, Button, Input, message, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '@/api/client';
import { ChartConfigPanel } from '@/features/charts/ChartConfigPanel';
import { DashboardFilterBar } from '@/features/charts/DashboardFilterBar';
import { DesignerCanvas } from '@/features/charts/DesignerCanvas';
import { chartTypeGroups } from '@/features/charts/chartUtils';
import { useAuthStore } from '@/store/authStore';
import { useDesignerStore } from '@/store/designerStore';
import { useEditorToolbarStore } from '@/store/editorToolbarStore';
import type { ChartStatus, ChartType } from '@/types/domain';
import { chartTypeLabels } from '@/types/domain';

export function ChartEditorPage() {
  const navigate = useNavigate();
  const params = useParams();
  const chartId = params.id ? Number(params.id) : undefined;
  const [loading, setLoading] = useState(Boolean(chartId));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [dataSourceCollapsed, setDataSourceCollapsed] = useState(false);
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === 'admin' || user?.role === 'editor';
  const meta = useDesignerStore((state) => state.meta);
  const widgets = useDesignerStore((state) => state.widgets);
  const reset = useDesignerStore((state) => state.reset);
  const load = useDesignerStore((state) => state.load);
  const setMeta = useDesignerStore((state) => state.setMeta);
  const addWidget = useDesignerStore((state) => state.addWidget);
  const toPayload = useDesignerStore((state) => state.toPayload);
  const setToolbar = useEditorToolbarStore((state) => state.setToolbar);
  const clearToolbar = useEditorToolbarStore((state) => state.clearToolbar);

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

  const handleDashboardNameBlur = () => {
    if (!meta.name.trim()) {
      setMeta({ name: '未命名仪表盘' });
    }
  };

  const handleAddWidget = (type: ChartType) => {
    addWidget(type);
  };

  const saveDashboard = useCallback(async (statusOverride?: ChartStatus) => {
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
    const payload = toPayload();
    if (statusOverride) {
      payload.status = statusOverride;
    }
    const saved = chartId ? await api.updateChart(chartId, payload) : await api.createChart(payload);
    if (statusOverride) {
      setMeta({ status: statusOverride });
    }
    if (!chartId) {
      navigate(`/charts/${saved.id}/edit`, { replace: true });
    }
    return saved;
  }, [canWrite, chartId, meta.name, navigate, setMeta, toPayload, widgets.length]);

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
      if (chartId) {
        await api.publishChart(chartId);
        setMeta({ status: 'published' });
      } else {
        await saveDashboard('published');
      }
      message.success('仪表盘已发布');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '发布仪表盘失败');
    } finally {
      setPublishing(false);
    }
  }, [canWrite, chartId, saveDashboard, setMeta]);

  const handleSaveAndPublish = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await saveDashboard('published');
      if (saved) {
        message.success('仪表盘已保存并发布');
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存并发布失败');
    } finally {
      setSaving(false);
    }
  }, [saveDashboard]);

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
    </div>
  );
}

function ChartTypeIcon({ type }: { type: ChartType }) {
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

  if (type === 'pie') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#fff7e6" />
          <path d="M14 6a8 8 0 018 8h-8z" fill="#1677ff" />
          <path d="M22 14a8 8 0 01-11.6 7.1L14 14z" fill="#52c41a" />
          <path d="M10.4 21.1A8 8 0 0114 6v8z" fill="#fa8c16" />
        </svg>
      </span>
    );
  }

  if (type === 'bar') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#f6ffed" />
          <rect x="7" y="8" width="14" height="4" rx="2" fill="#36cfc9" />
          <rect x="7" y="13" width="10" height="4" rx="2" fill="#1677ff" />
          <rect x="7" y="18" width="16" height="4" rx="2" fill="#9254de" />
        </svg>
      </span>
    );
  }

  if (type === 'column') {
    return (
      <span className="chart-type-icon" aria-hidden="true">
        <svg className="chart-type-icon-svg" viewBox="0 0 28 28" focusable="false">
          <rect x="3" y="3" width="22" height="22" rx="6" fill="#f0f5ff" />
          <rect x="7" y="14" width="4" height="7" rx="1.5" fill="#36cfc9" />
          <rect x="12" y="10" width="4" height="11" rx="1.5" fill="#1677ff" />
          <rect x="17" y="7" width="4" height="14" rx="1.5" fill="#9254de" />
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

  if (type === 'text') {
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
