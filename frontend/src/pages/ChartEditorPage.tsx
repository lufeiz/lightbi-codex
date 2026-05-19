import {
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  PlusOutlined,
  TableOutlined
} from '@ant-design/icons';
import { Alert, Button, Drawer, Input, message, Space, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '@/api/client';
import { ChartConfigPanel } from '@/features/charts/ChartConfigPanel';
import { DesignerCanvas } from '@/features/charts/DesignerCanvas';
import { chartTypeGroups } from '@/features/charts/chartUtils';
import { useAuthStore } from '@/store/authStore';
import { useDesignerStore } from '@/store/designerStore';
import { useEditorToolbarStore } from '@/store/editorToolbarStore';
import type { ChartStatus, ChartType } from '@/types/domain';
import { chartTypeLabels } from '@/types/domain';

const chartIcons: Partial<Record<ChartType, ReactNode>> = {
  detailTable: <TableOutlined />,
  pivotTable: <TableOutlined />,
  comparisonTable: <TableOutlined />,
  line: <LineChartOutlined />,
  column: <BarChartOutlined />,
  bar: <BarChartOutlined />,
  pie: <PieChartOutlined />
};

export function ChartEditorPage() {
  const navigate = useNavigate();
  const params = useParams();
  const chartId = params.id ? Number(params.id) : undefined;
  const [loading, setLoading] = useState(Boolean(chartId));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
    setPaletteOpen(false);
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
          <Typography.Text type="secondary">{chartId ? '编辑仪表盘' : '创建仪表盘'}</Typography.Text>
          <Input
            className="dashboard-name-input"
            value={meta.name}
            disabled={!canWrite}
            placeholder="请输入仪表盘名称"
            onChange={(event) => setMeta({ name: event.target.value })}
            onBlur={handleDashboardNameBlur}
          />
          <Typography.Text type="secondary">
            一个仪表盘可放置多个图表；添加图表后，在右侧配置数据源、维度和指标，再点击更新渲染。
          </Typography.Text>
        </div>
      </header>

      <div className="editor-layout">
        <div className="editor-canvas-shell">
          <Button className="chart-drawer-trigger" icon={<PlusOutlined />} disabled={!canWrite} onClick={() => setPaletteOpen(true)}>
            图表
          </Button>
          <DesignerCanvas />
        </div>

        <aside className="inspector-panel">
          <ChartConfigPanel />
        </aside>
      </div>

      <Drawer
        title="添加图表"
        placement="left"
        width={360}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        destroyOnClose
      >
        <Space direction="vertical" size={20} className="full-width">
          {chartTypeGroups.map((group) => (
            <section key={group.key} className="chart-type-group">
              <Typography.Title level={5}>{group.title}</Typography.Title>
              <Space direction="vertical" className="full-width">
                {group.types.map((type) => (
                  <Button
                    key={type}
                    className="palette-button"
                    icon={chartIcons[type]}
                    disabled={!canWrite}
                    onClick={() => handleAddWidget(type)}
                  >
                    {chartTypeLabels[type]}
                  </Button>
                ))}
              </Space>
            </section>
          ))}
        </Space>
      </Drawer>
    </div>
  );
}
