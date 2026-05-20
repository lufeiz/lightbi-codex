import { BoldOutlined, DatabaseOutlined, DragOutlined, FontColorsOutlined, ItalicOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, message, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import type { ClipboardEvent, DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
  const isTextWidget = selectedWidget.type === 'text';

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
    if (isTextWidget || !datasetType) {
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
  }, [isTextWidget, selectedWidget?.config.datasetType]);

  useEffect(() => {
    const widgetId = selectedWidget?.id;
    const datasetId = selectedWidget?.config.datasetId;
    if (isTextWidget || !datasetId) {
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
  }, [isTextWidget, selectedWidget?.config.datasetId, selectedWidget?.id, updateWidgetConfig]);

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
    !isTextWidget && selectedWidget.config.datasetId && selectedWidget.config.dimensions.length && selectedWidget.config.measures.length
  );

  if (isTextWidget) {
    return <RichTextConfigPanel selectedWidget={selectedWidget} onConfigChange={(patch) => updateWidgetConfig(selectedWidget.id, patch)} />;
  }

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
        <Typography.Text className="config-section-title">数据源配置</Typography.Text>
        <Typography.Text className="data-source-field-label" type="secondary">
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
        <Typography.Text className="data-source-field-label" type="secondary">
          数据集
        </Typography.Text>
        <Select
          allowClear
          showSearch
          disabled={!selectedWidget.config.datasetType}
          value={selectedWidget.config.datasetId}
          placeholder="选择数据集"
          optionFilterProp="label"
          options={datasets.map((dataset) => ({
            value: dataset.id,
            label: `${dataset.name} · ${dataset.sourceName}`
          }))}
          onChange={changeDataset}
        />
        {datasetError && <Alert className="inline-alert" type="error" showIcon message={datasetError} />}
        {datasetFields && (
          <div className="field-pool data-source-field-pool">
            <div className="field-pool-header">
              <DatabaseOutlined />
              <span>{selectedWidget.config.datasetName ?? '已选择数据集'}</span>
            </div>
            <FieldList title="维度字段" role="dimensions" fields={datasetFields.dimensions} onPick={addField} />
            <FieldList title="指标字段" role="measures" fields={datasetFields.measures} onPick={addField} />
          </div>
        )}
        <Typography.Text className="data-source-help" type="secondary">
          当前选择仅作用于选中的图表
        </Typography.Text>
      </aside>
    </div>
  );
}

interface RichTextConfigPanelProps {
  selectedWidget: ChartWidget;
  onConfigChange: (patch: Partial<ChartConfig>) => void;
}

function RichTextConfigPanel({ selectedWidget, onConfigChange }: RichTextConfigPanelProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    editorRef.current.innerHTML = selectedWidget.config.textHtml || escapeHtml(selectedWidget.config.textContent || '输入文本内容');
    selectionRef.current = null;
  }, [selectedWidget.id]);

  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    const range = selectionRef.current;
    if (!editor || !range) {
      editor?.focus({ preventScroll: true });
      return;
    }
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const syncEditorHtml = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    onConfigChange({
      textHtml: editor.innerHTML,
      textContent: editor.innerText
    });
    saveSelection();
  };

  const runCommand = (command: 'bold' | 'italic' | 'foreColor', value?: string) => {
    restoreSelection();
    document.execCommand(command, false, value);
    syncEditorHtml();
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    restoreSelection();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    syncEditorHtml();
  };

  return (
    <div className="config-panel-shell text-config-shell">
      <div className="config-form-module">
        <Typography.Text className="selected-chart-type" type="secondary">
          {chartTypeLabels[selectedWidget.type]}
        </Typography.Text>
        <section className="config-section">
          <Typography.Text className="config-section-title">文本配置</Typography.Text>
          <div className="rich-text-toolbar" aria-label="文本样式工具栏">
            <Tooltip title="加粗选中文字">
              <Button type="text" icon={<BoldOutlined />} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('bold')} />
            </Tooltip>
            <Tooltip title="斜体选中文字">
              <Button type="text" icon={<ItalicOutlined />} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('italic')} />
            </Tooltip>
            <Tooltip title="设置选中文字颜色">
              <label className="rich-text-color-control" onMouseDown={saveSelection}>
                <FontColorsOutlined />
                <input type="color" defaultValue="#172033" onChange={(event) => runCommand('foreColor', event.target.value)} />
              </label>
            </Tooltip>
          </div>
          <div
            ref={editorRef}
            className="rich-text-editor"
            role="textbox"
            aria-label="文本内容"
            contentEditable
            suppressContentEditableWarning
            onBlur={syncEditorHtml}
            onInput={syncEditorHtml}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            onPaste={handlePaste}
          />
        </section>
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('\n', '<br />');
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
