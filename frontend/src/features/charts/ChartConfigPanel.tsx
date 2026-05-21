import {
  BoldOutlined,
  DatabaseOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined
} from '@ant-design/icons';
import { Alert, Button, Form, Input, message, Select, Switch, Tag, Tooltip, Typography } from 'antd';
import DOMPurify from 'dompurify';
import type { ClipboardEvent, DragEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/api/client';
import dimensionFieldIcon from '@/assets/dimension-field-icon.svg';
import measureFieldIcon from '@/assets/measure-field-icon.svg';
import { useDesignerStore } from '@/store/designerStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ChartConfig, ChartWidget, DatasetField, DatasetQueryConfig, DatasetSummary, DatasetType } from '@/types/domain';
import { chartTypeLabels, datasetTypeLabels } from '@/types/domain';

interface DatasetFieldSet {
  dimensions: DatasetField[];
  measures: DatasetField[];
}

interface ChartConfigPanelProps {
  configCollapsed: boolean;
  dataSourceCollapsed: boolean;
  onConfigCollapsedChange: (collapsed: boolean) => void;
  onDataSourceCollapsedChange: (collapsed: boolean) => void;
}

export function ChartConfigPanel({
  configCollapsed,
  dataSourceCollapsed,
  onConfigCollapsedChange,
  onDataSourceCollapsedChange
}: ChartConfigPanelProps) {
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

  return (
    <SelectedChartConfigPanel
      selectedWidget={selectedWidget}
      configCollapsed={configCollapsed}
      dataSourceCollapsed={dataSourceCollapsed}
      onConfigCollapsedChange={onConfigCollapsedChange}
      onDataSourceCollapsedChange={onDataSourceCollapsedChange}
    />
  );
}

interface SelectedChartConfigPanelProps {
  selectedWidget: ChartWidget;
  configCollapsed: boolean;
  dataSourceCollapsed: boolean;
  onConfigCollapsedChange: (collapsed: boolean) => void;
  onDataSourceCollapsedChange: (collapsed: boolean) => void;
}

function SelectedChartConfigPanel({
  selectedWidget,
  configCollapsed,
  dataSourceCollapsed,
  onConfigCollapsedChange,
  onDataSourceCollapsedChange
}: SelectedChartConfigPanelProps) {
  const [form] = Form.useForm<ChartConfig>();
  const updateWidgetConfig = useDesignerStore((state) => state.updateWidgetConfig);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetFields, setDatasetFields] = useState<DatasetFieldSet | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [updatingPreview, setUpdatingPreview] = useState(false);
  const runtimeRows = useDesignerStore((state) => state.runtimeRows[selectedWidget.id] ?? []);
  const setWidgetRows = useDesignerStore((state) => state.setWidgetRows);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const isTextWidget = selectedWidget.type === 'text' || selectedWidget.type === 'richText';

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
      .datasets(datasetType, { workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined })
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
  }, [isTextWidget, projectId, selectedWidget?.config.datasetType, workspaceId]);

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
    const nextQuery = buildQueryConfig({ ...selectedWidget.config, [target]: next });
    updateWidgetConfig(selectedWidget.id, { [target]: next, query: nextQuery });
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
      const query = buildQueryConfig(selectedWidget.config);
      const result = await api.queryDataset(datasetId, query);
      setWidgetRows(selectedWidget.id, result.rows);
      updateWidgetConfig(selectedWidget.id, { query });
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
      query: { dimensions: [], metrics: [], filters: [], sorts: [], limit: 500, timeComparison: 'none' },
      fieldLabels: {}
    });
    updateWidgetConfig(selectedWidget.id, {
      datasetType,
      datasetId: undefined,
      datasetName: undefined,
      dimensions: [],
      measures: [],
      query: { dimensions: [], metrics: [], filters: [], sorts: [], limit: 500, timeComparison: 'none' },
      fieldLabels: {}
    });
    setWidgetRows(selectedWidget.id, []);
  };

  const changeDataset = (datasetId?: number) => {
    const datasetName = datasets.find((item) => item.id === datasetId)?.name;
    const emptyQuery = { dimensions: [], metrics: [], filters: [], sorts: [], limit: 500, timeComparison: 'none' as const };
    form.setFieldsValue({ datasetId, datasetName, dimensions: [], measures: [], query: emptyQuery, fieldLabels: {} });
    updateWidgetConfig(selectedWidget.id, { datasetId, datasetName, dimensions: [], measures: [], query: emptyQuery, fieldLabels: {} });
    setWidgetRows(selectedWidget.id, []);
  };

  const canUpdatePreview = Boolean(
    !isTextWidget && selectedWidget.config.datasetId && selectedWidget.config.dimensions.length && selectedWidget.config.measures.length
  );

  if (isTextWidget) {
    return <RichTextConfigPanel selectedWidget={selectedWidget} onConfigChange={(patch) => updateWidgetConfig(selectedWidget.id, patch)} />;
  }

  return (
    <div
      className={[
        'config-panel-shell',
        configCollapsed ? 'config-panel-shell-config-collapsed' : '',
        dataSourceCollapsed ? 'config-panel-shell-data-collapsed' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!configCollapsed && (
        <div className="config-form-module drawer-module">
          <div className="drawer-module-header">
            <Typography.Text className="drawer-module-title">图表配置</Typography.Text>
            <Button
              aria-label="收起图表配置"
              icon={<RightOutlined />}
              size="small"
              type="text"
              onClick={() => onConfigCollapsedChange(true)}
            />
          </div>
          <Form<ChartConfig>
            form={form}
            className="render-config-form drawer-module-body"
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
              <Form.Item label="维度">
                <SelectedFieldDropZone
                  role="dimensions"
                  fields={selectedWidget.config.dimensions ?? []}
                  fieldLabels={selectedWidget.config.fieldLabels}
                  onDrop={handleDrop}
                  onRemove={(field) =>
                    changeFields(
                      'dimensions',
                      (selectedWidget.config.dimensions ?? []).filter((item) => item !== field)
                    )
                  }
                />
              </Form.Item>
              <Form.Item label="指标">
                <SelectedFieldDropZone
                  role="measures"
                  fields={selectedWidget.config.measures ?? []}
                  fieldLabels={selectedWidget.config.fieldLabels}
                  onDrop={handleDrop}
                  onRemove={(field) =>
                    changeFields(
                      'measures',
                      (selectedWidget.config.measures ?? []).filter((item) => item !== field)
                    )
                  }
                />
              </Form.Item>
              <div className="config-switch-list">
                <div className="config-switch-item">
                  <span>显示标签</span>
                  <Form.Item name="showLabel" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                </div>
                <div className="config-switch-item">
                  <span>显示 Tooltip</span>
                  <Form.Item name="showTooltip" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                </div>
                <div className="config-switch-item">
                  <span>显示 Scrollbar</span>
                  <Form.Item name="showScrollbar" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                </div>
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
            {runtimeRows.length ? (
              <Typography.Text className="preview-data-status" type="secondary">
                已加载 {runtimeRows.length} 条数据
              </Typography.Text>
            ) : null}
          </Form>
        </div>
      )}
      {!configCollapsed && !dataSourceCollapsed && <div className="config-module-divider" />}
      {!dataSourceCollapsed && (
        <aside className="data-source-module drawer-module">
          <div className="drawer-module-header">
            <Typography.Text className="drawer-module-title">数据源配置</Typography.Text>
            <Button
              aria-label="收起数据源配置"
              icon={<RightOutlined />}
              size="small"
              type="text"
              onClick={() => onDataSourceCollapsedChange(true)}
            />
          </div>
          <div className="drawer-module-body data-source-body">
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
          </div>
        </aside>
      )}
      {(configCollapsed || dataSourceCollapsed) && (
        <div className="drawer-floating-actions" aria-label="收起模块快捷入口">
          {configCollapsed && (
            <Button
              aria-label="展开图表配置"
              className="drawer-floating-button"
              icon={<LeftOutlined />}
              onClick={() => onConfigCollapsedChange(false)}
            />
          )}
          {dataSourceCollapsed && (
            <Button
              aria-label="展开数据源配置"
              className="drawer-floating-button"
              icon={<LeftOutlined />}
              onClick={() => onDataSourceCollapsedChange(false)}
            />
          )}
        </div>
      )}
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
    editorRef.current.innerHTML = DOMPurify.sanitize(selectedWidget.config.textHtml || escapeHtml(selectedWidget.config.textContent || '输入文本内容'));
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
      textHtml: DOMPurify.sanitize(editor.innerHTML),
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

function buildQueryConfig(config: ChartConfig): DatasetQueryConfig {
  return {
    dimensions: config.dimensions ?? [],
    metrics: (config.measures ?? []).map((field) => ({
      field,
      aggregation: 'sum',
      alias: field
    })),
    filters: config.query?.filters ?? [],
    sorts: config.query?.sorts ?? [],
    topN: config.query?.topN,
    limit: config.query?.limit ?? 500,
    timeComparison: config.query?.timeComparison ?? 'none'
  };
}

interface FieldListProps {
  title: string;
  role: 'dimensions' | 'measures';
  fields: DatasetField[];
  onPick: (target: 'dimensions' | 'measures', field: DatasetField) => void;
}

interface SelectedFieldDropZoneProps {
  role: 'dimensions' | 'measures';
  fields: string[];
  fieldLabels?: Record<string, string>;
  onDrop: (target: 'dimensions' | 'measures', event: DragEvent<HTMLDivElement>) => void;
  onRemove: (field: string) => void;
}

function SelectedFieldDropZone({ role, fields, fieldLabels, onDrop, onRemove }: SelectedFieldDropZoneProps) {
  const placeholder = role === 'dimensions' ? '双击或拖拽维度字段到这里' : '双击或拖拽指标字段到这里';

  return (
    <div
      className={`field-drop-zone field-drop-zone-${role}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(role, event)}
    >
      {fields.length ? (
        <div className="selected-field-list">
          {fields.map((field) => (
            <Tag
              key={field}
              className={`selected-field-tag selected-field-tag-${role}`}
              closable
              color={role === 'dimensions' ? 'blue' : 'green'}
              onClose={(event) => {
                event.preventDefault();
                onRemove(field);
              }}
            >
              <FieldRoleIcon role={role} />
              <span className="selected-field-label">{fieldLabels?.[field] ?? field}</span>
            </Tag>
          ))}
        </div>
      ) : (
        <div className={`field-drop-placeholder field-drop-placeholder-${role}`}>
          <FieldRoleIcon role={role} />
          <span>{placeholder}</span>
        </div>
      )}
    </div>
  );
}

function FieldRoleIcon({ role }: { role: 'dimensions' | 'measures' }) {
  return (
    <img
      className={`field-role-icon field-role-icon-${role}`}
      src={role === 'dimensions' ? dimensionFieldIcon : measureFieldIcon}
      alt={role === 'dimensions' ? '维度' : '指标'}
      draggable={false}
    />
  );
}

function FieldList({ title, role, fields, onPick }: FieldListProps) {
  return (
    <div className="field-list">
      <Typography.Text type="secondary">{title}</Typography.Text>
      <div className="field-list-body">
        {fields.map((field) => (
          <Tag
            key={field.name}
            className={`field-token field-token-${role}`}
            draggable
            color={role === 'dimensions' ? 'blue' : 'green'}
            onDoubleClick={() => onPick(role, field)}
            onDragStart={(event) => {
              event.dataTransfer.setData('application/json', JSON.stringify({ ...field, role }));
            }}
          >
            <FieldRoleIcon role={role} />
            <span className="field-token-label">{field.label}</span>
          </Tag>
        ))}
      </div>
    </div>
  );
}
