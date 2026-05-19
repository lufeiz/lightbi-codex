import {
  BarChartOutlined,
  CheckOutlined,
  LineChartOutlined,
  PieChartOutlined,
  PlusOutlined,
  SaveOutlined,
  TableOutlined
} from '@ant-design/icons';
import { Alert, Button, Card, Drawer, Form, Input, message, Select, Space, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '@/api/client';
import { ChartConfigPanel } from '@/features/charts/ChartConfigPanel';
import { DesignerCanvas } from '@/features/charts/DesignerCanvas';
import { chartStatusOptions, chartTypeGroups, groupToSelectOptions } from '@/features/charts/chartUtils';
import { useAuthStore } from '@/store/authStore';
import { useDesignerStore } from '@/store/designerStore';
import type { ChartGroup, ChartStatus, ChartTag, ChartType } from '@/types/domain';
import { chartTypeLabels } from '@/types/domain';

interface MetaFormValues {
  description: string;
  status: ChartStatus;
  groupId?: number;
  tagIds: number[];
}

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
  const [metaForm] = Form.useForm<MetaFormValues>();
  const [groups, setGroups] = useState<ChartGroup[]>([]);
  const [tags, setTags] = useState<ChartTag[]>([]);
  const [loading, setLoading] = useState(Boolean(chartId));
  const [saving, setSaving] = useState(false);
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

  const groupOptions = useMemo(() => groupToSelectOptions(groups), [groups]);
  const tagOptions = useMemo(() => tags.map((tag) => ({ value: tag.id, label: tag.name })), [tags]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [groupData, tagData] = await Promise.all([api.groups(), api.tags()]);
      setGroups(groupData);
      setTags(tagData);
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
    metaForm.setFieldsValue({
      description: meta.description,
      status: meta.status,
      groupId: meta.groupId ?? undefined,
      tagIds: meta.tagIds
    });
  }, [meta, metaForm]);

  const handleMetaChange = (_changed: Partial<MetaFormValues>, values: MetaFormValues) => {
    setMeta({
      description: values.description,
      status: values.status,
      groupId: values.groupId ?? null,
      tagIds: values.tagIds ?? []
    });
  };

  const handleDashboardNameBlur = () => {
    if (!meta.name.trim()) {
      setMeta({ name: '未命名仪表盘' });
    }
  };

  const handleAddWidget = (type: ChartType) => {
    addWidget(type);
    setPaletteOpen(false);
  };

  const handleSave = async () => {
    if (!canWrite) {
      message.warning('当前角色只读，不能保存仪表盘');
      return;
    }
    if (!meta.name.trim()) {
      message.warning('请输入仪表盘名称');
      return;
    }
    if (widgets.length === 0) {
      message.warning('请至少添加一个图表');
      return;
    }
    await metaForm.validateFields();
    setSaving(true);
    try {
      const payload = toPayload();
      const saved = chartId ? await api.updateChart(chartId, payload) : await api.createChart(payload);
      message.success('仪表盘已保存');
      if (!chartId) {
        navigate(`/charts/${saved.id}/edit`, { replace: true });
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存仪表盘失败');
    } finally {
      setSaving(false);
    }
  };

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
        <Space>
          <Button icon={<PlusOutlined />} disabled={!canWrite} onClick={() => setPaletteOpen(true)}>
            添加图表
          </Button>
          <Button onClick={() => navigate('/charts')}>返回列表</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!canWrite} onClick={handleSave}>
            保存
          </Button>
        </Space>
      </header>

      <div className="editor-layout">
        <DesignerCanvas />

        <aside className="inspector-panel">
          <Card className="meta-card" title="资产信息">
            <Form<MetaFormValues>
              form={metaForm}
              layout="vertical"
              disabled={!canWrite}
              onValuesChange={handleMetaChange}
            >
              <Form.Item name="description" label="描述">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>
              <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
                <Select options={chartStatusOptions} />
              </Form.Item>
              <Form.Item name="groupId" label="分组目录">
                <Select allowClear options={groupOptions} />
              </Form.Item>
              <Form.Item name="tagIds" label="标签">
                <Select mode="multiple" allowClear options={tagOptions} />
              </Form.Item>
            </Form>
          </Card>
          <Card className="config-card" title={<span><CheckOutlined /> 渲染配置</span>}>
            <ChartConfigPanel />
          </Card>
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
