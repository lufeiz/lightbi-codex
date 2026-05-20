import { DatabaseOutlined, DragOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, message, Select, Space, Switch, Tag, Typography } from 'antd';
import type { DragEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { api } from '@/api/client';
import { useDesignerStore } from '@/store/designerStore';
import type { ChartConfig, ChartWidget, DatasetField, DatasetSummary, DatasetType } from '@/types/domain';
import { chartTypeLabels, datasetTypeLabels } from '@/types/domain';

interface DatasetFieldSet {
  dimensions: DatasetField[];
  measures: DatasetField[];
}

export function ChartConfigPanel() {
  const widgets = useDesignerStore((state) => state.widgets);
  const selectedWidgetId = useDesignerStore((state) => state.selectedWidgetId);
  const selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId) ?? null;

  if (!selectedWidget) {
    return (
      <div className="empty-config">
        <Typography.Text type="secondary">请选择画布中的图表节点。</Typography.Text>
      </div>
    );
  }

  return <SelectedChartConfigPanel selectedWidget={selectedWidget} />;
}

interface SelectedChartConfigPanelProps {
  selectedWidget: ChartWidget;
}

function SelectedChartConfigPanel({ selectedWidget }: SelectedChartConfigPanelProps) {
  const [form] = Form.useForm<ChartConfig>();
  const updateWidgetConfig = useDesignerStore((state) => state.updateWidgetConfig);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetFields, setDatasetFields] = useState<DatasetFieldSet | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [updatingPreview, setUpdatingPreview] = useState(false);

  const dimensionOptions = useMemo(
    () => (datasetFields?.dimensions ?? []).map((field) => ({ value: field.name, label: `${field.label} (${field.name})` })),
    [datasetFields]
  );
  const measureOptions = useMemo(
    () => (datasetFields?.measures ?? []).map((field) => ({ value: field.name, label: `${field.label} (${field.name})` })),
    [datasetFields]
  );

  useEffect(() => {
    if (selectedWidget) {
      form.setFieldsValue(selectedWidget.config);
    } else {
      form.resetFields();
    }
  }, [form, selectedWidget]);

  useEffect(() => {
    const datasetType = selectedWidget?.config.datasetType;
    if (!datasetType) {
      setDatasets([]);
      setDatasetFields(null);
      setDatasetError(null);
      return;
    }
    let active = true;
    setDatasets([]);
    setDatasetFields(null);
    setDatasetError(null);
    void api
      .datasets(datasetType)
      .then((items) => {
        if (active) {
          setDatasets(items);
        }
      })
      .catch((err) => {
        if (active) {
          setDatasetError(err instanceof Error ? err.message : '加载数据集失败');
        }
      });

    return () => {
      active = false;
    };
  }, [selectedWidget?.config.datasetType]);

  useEffect(() => {
    const widgetId = selectedWidget?.id;
    const datasetId = selectedWidget?.config.datasetId;
    if (!datasetId) {
      setDatasetFields(null);
      setDatasetError(null);
      return;
    }
    let active = true;
    setDatasetFields(null);
    setDatasetError(null);
    void api
      .datasetFields(datasetId)
      .then((fields) => {
        if (!active) {
          return;
        }
        setDatasetFields(fields);
        if (widgetId) {
          updateWidgetConfig(widgetId, { fieldLabels: buildFieldLabels(fields) });
        }
      })
      .catch((err) => {
        if (active) {
          setDatasetError(err instanceof Error ? err.message : '加载字段失败');
        }
      });

    return () => {
      active = false;
    };
  }, [selectedWidget?.config.datasetId, selectedWidget?.id, updateWidgetConfig]);

  const addField = (target: 'dimensions' | 'measures', field: DatasetField) => {
    const current = selectedWidget.config[target] ?? [];
    if (current.includes(field.name)) {
      return;
    }
    const next = [...current, field.name];
    changeFields(target, next);
    if (target === 'measures' && current.length === 0) {
      form.setFieldValue('labelField', field.label);
      updateWidgetConfig(selectedWidget.id, { labelField: field.label });
    }
  };

  const changeFields = (target: 'dimensions' | 'measures', fields: string[]) => {
    const next = Array.from(new Set(fields));
    form.setFieldValue(target, next);
    updateWidgetConfig(selectedWidget.id, { [target]: next });
  };

  const handleDrop = (target: 'dimensions' | 'measures', event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/json');
    if (!raw) {
      return;
    }
    const field = JSON.parse(raw) as DatasetField & { role: 'dimensions' | 'measures' };
    if (field.role !== target) {
      return;
    }
    addField(target, field);
  };

  const updatePreviewData = async () => {
    const datasetId = selectedWidget.config.datasetId;
    if (!datasetId) {
      message.warning('请先选择数据集');
      return;
    }
    if (!selectedWidget.config.dimensions.length || !selectedWidget.config.measures.length) {
      message.warning('请先配置维度和指标');
      return;
    }
    setUpdatingPreview(true);
    try {
      const rows = await api.datasetRows(datasetId);
      updateWidgetConfig(selectedWidget.id, { previewRows: rows });
      message.success('图表数据已更新');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新图表数据失败');
    } finally {
      setUpdatingPreview(false);
    }
  };

  const changeDatasetType = (datasetType?: DatasetType) => {
    form.setFieldsValue({
      datasetType,
      datasetId: undefined,
      datasetName: undefined,
      dimensions: [],
      measures: [],
      previewRows: [],
      fieldLabels: {}
    });
    updateWidgetConfig(selectedWidget.id, {
      datasetType,
      datasetId: undefined,
      datasetName: undefined,
      dimensions: [],
      measures: [],
      previewRows: [],
      fieldLabels: {}
    });
  };

  const changeDataset = (datasetId?: number) => {
    const datasetName = datasets.find((item) => item.id === datasetId)?.name;
    form.setFieldsValue({ datasetId, datasetName, dimensions: [], measures: [], previewRows: [], fieldLabels: {} });
    updateWidgetConfig(selectedWidget.id, { datasetId, datasetName, dimensions: [], measures: [], previewRows: [], fieldLabels: {} });
  };

  const canUpdatePreview = Boolean(
    selectedWidget.config.datasetId && selectedWidget.config.dimensions.length && selectedWidget.config.measures.length
  );

  return (
    <div className="config-panel-shell">
      <div className="config-form-module">
        <Form<ChartConfig>
          form={form}
          className="render-config-form"
          layout="vertical"
          onValuesChange={(_, values) => updateWidgetConfig(selectedWidget.id, values)}
        >
          <Typography.Text className="selected-chart-type" type="secondary">
            {chartTypeLabels[selectedWidget.type]}
          </Typography.Text>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <section className="config-section">
            <Typography.Text className="config-section-title">数据源配置</Typography.Text>
            <Form.Item name="datasetId" label="数据集" rules={[{ required: true, message: '请选择数据集' }]}>
              <Select
                allowClear
                showSearch
                disabled={!selectedWidget.config.datasetType}
                placeholder="先在右侧选择数据源类型"
                optionFilterProp="label"
                options={datasets.map((dataset) => ({
                  value: dataset.id,
                  label: `${dataset.name} · ${dataset.sourceName}`
                }))}
                onChange={changeDataset}
              />
            </Form.Item>
            {datasetError && <Alert className="inline-alert" type="error" showIcon message={datasetError} />}
            {datasetFields && (
              <div className="field-pool">
                <div className="field-pool-header">
                  <DatabaseOutlined />
                  <span>{selectedWidget.config.datasetName ?? '已选择数据集'}</span>
                </div>
                <FieldList title="维度字段" role="dimensions" fields={datasetFields.dimensions} onPick={addField} />
                <FieldList title="指标字段" role="measures" fields={datasetFields.measures} onPick={addField} />
              </div>
            )}
          </section>
          <section className="config-section">
            <Typography.Text className="config-section-title">图表配置</Typography.Text>
            <Form.Item label="维度">
              <div className="field-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop('dimensions', event)}>
                <Select
                  mode="multiple"
                  placeholder="双击或拖拽维度字段到这里"
                  options={dimensionOptions}
                  value={selectedWidget.config.dimensions ?? []}
                  onChange={(fields) => changeFields('dimensions', fields)}
                />
              </div>
            </Form.Item>
            <Form.Item label="指标">
              <div className="field-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop('measures', event)}>
                <Select
                  mode="multiple"
                  placeholder="双击或拖拽指标字段到这里"
                  options={measureOptions}
                  value={selectedWidget.config.measures ?? []}
                  onChange={(fields) => changeFields('measures', fields)}
                />
              </div>
            </Form.Item>
            <Form.Item name="labelField" label="标签字段">
              <Input placeholder="销售额" />
            </Form.Item>
            <div className="config-switch-row">
              <Form.Item name="showLabel" label="显示标签" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showTooltip" label="显示 Tooltip" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="showScrollbar" label="显示 Scrollbar" valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
          </section>
          <Button
            block
            type="primary"
            icon={<ReloadOutlined />}
            loading={updatingPreview}
            disabled={!canUpdatePreview}
            onClick={() => void updatePreviewData()}
          >
            更新图表
          </Button>
          {selectedWidget.config.previewRows?.length ? (
            <Typography.Text className="preview-data-status" type="secondary">
              已加载 {selectedWidget.config.previewRows.length} 条数据
            </Typography.Text>
          ) : null}
        </Form>
      </div>
      <div className="config-module-divider" />
      <aside className="data-source-module">
        <Typography.Text className="data-source-rail-label" type="secondary">
          数据源类型
        </Typography.Text>
        <Select
          allowClear
          value={selectedWidget.config.datasetType}
          placeholder="先选类型"
          options={[
            { value: 'standard', label: datasetTypeLabels.standard },
            { value: 'direct', label: datasetTypeLabels.direct }
          ]}
          onChange={changeDatasetType}
        />
        <Typography.Text className="data-source-help" type="secondary">
          当前选择仅作用于选中的图表
        </Typography.Text>
      </aside>
    </div>
  );
}

function buildFieldLabels(fields: DatasetFieldSet): Record<string, string> {
  return [...fields.dimensions, ...fields.measures].reduce<Record<string, string>>((labels, field) => {
    labels[field.name] = field.label;
    return labels;
  }, {});
}

interface FieldListProps {
  title: string;
  role: 'dimensions' | 'measures';
  fields: DatasetField[];
  onPick: (target: 'dimensions' | 'measures', field: DatasetField) => void;
}

function FieldList({ title, role, fields, onPick }: FieldListProps) {
  return (
    <div className="field-list">
      <Typography.Text type="secondary">{title}</Typography.Text>
      <Space size={[6, 6]} wrap>
        {fields.map((field) => (
          <Tag
            key={field.name}
            className="field-token"
            draggable
            icon={<DragOutlined />}
            color={role === 'dimensions' ? 'blue' : 'green'}
            onDoubleClick={() => onPick(role, field)}
            onDragStart={(event) => {
              event.dataTransfer.setData('application/json', JSON.stringify({ ...field, role }));
            }}
          >
            {field.label}
          </Tag>
        ))}
      </Space>
    </div>
  );
}
