import {
  BoldOutlined,
  DatabaseOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined
} from '@ant-design/icons';
import { Alert, Button, Form, Input, InputNumber, message, Select, Switch, Tag, Tooltip, Typography } from 'antd';
import DOMPurify from 'dompurify';
import type { ClipboardEvent, DragEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/api/client';
import dimensionFieldIcon from '@/assets/dimension-field-icon.svg';
import measureFieldIcon from '@/assets/measure-field-icon.svg';
import { getChartDefinition } from '@/features/charts/chartUtils';
import { useDesignerStore } from '@/store/designerStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ChartConfig, ChartWidget, DatasetField, DatasetQueryConfig, DatasetSummary, DatasetType, MetricAggregation, QuerySort } from '@/types/domain';
import { chartTypeLabels, datasetTypeLabels } from '@/types/domain';

interface DatasetFieldSet {
  dimensions: DatasetField[];
  measures: DatasetField[];
}

const EMPTY_RUNTIME_ROWS: never[] = [];

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
  const [queryError, setQueryError] = useState<string | null>(null);
  const [updatingPreview, setUpdatingPreview] = useState(false);
  const runtimeRows = useDesignerStore((state) => state.runtimeRows[selectedWidget.id] ?? EMPTY_RUNTIME_ROWS);
  const setWidgetRows = useDesignerStore((state) => state.setWidgetRows);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const isTextWidget = selectedWidget.type === 'text' || selectedWidget.type === 'richText';
  const chartDefinition = getChartDefinition(selectedWidget.type);
  const previewValidation = validatePreviewRequirements(selectedWidget, datasetFields);

  useEffect(() => {
    if (selectedWidget) {
      form.setFieldsValue({
        theme: 'default',
        labelSize: 12,
        enableLinkage: false,
        linkageMode: 'filter',
        ...selectedWidget.config
      });
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
      setQueryError(null);
      return;
    }
    let active = true;
    setDatasets([]);
    setDatasetFields(null);
    setDatasetError(null);
    setQueryError(null);
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
      setQueryError(null);
      return;
    }
    let active = true;
    setDatasetFields(null);
    setDatasetError(null);
    setQueryError(null);
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
    if (!previewValidation.canPreview) {
      message.warning(previewValidation.reasons[0] ?? '图表配置不完整');
      return;
    }
    setUpdatingPreview(true);
    setQueryError(null);
    try {
      const query = buildQueryConfig(selectedWidget.config);
      const result = await api.queryDataset(datasetId, query);
      setWidgetRows(selectedWidget.id, result.rows);
      updateWidgetConfig(selectedWidget.id, { query });
      message.success('图表数据已更新');
    } catch (err) {
      const nextError = err instanceof Error ? err.message : '更新图表数据失败';
      setQueryError(nextError);
      message.error(nextError);
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
    setQueryError(null);
  };

  const changeDataset = (datasetId?: number) => {
    const datasetName = datasets.find((item) => item.id === datasetId)?.name;
    const emptyQuery = { dimensions: [], metrics: [], filters: [], sorts: [], limit: 500, timeComparison: 'none' as const };
    form.setFieldsValue({ datasetId, datasetName, dimensions: [], measures: [], query: emptyQuery, fieldLabels: {} });
    updateWidgetConfig(selectedWidget.id, { datasetId, datasetName, dimensions: [], measures: [], query: emptyQuery, fieldLabels: {} });
    setWidgetRows(selectedWidget.id, []);
    setQueryError(null);
  };

  const changeMetricAggregation = (field: string, aggregation: MetricAggregation) => {
    const currentMetrics = selectedWidget.config.query?.metrics ?? [];
    const currentByField = new Map(currentMetrics.map((metric) => [metric.field, metric]));
    const metrics = (selectedWidget.config.measures ?? []).map((measure) => ({
      field: measure,
      aggregation: measure === field ? aggregation : currentByField.get(measure)?.aggregation ?? 'sum',
      alias: currentByField.get(measure)?.alias ?? measure
    }));
    const currentQuery = selectedWidget.config.query ?? buildQueryConfig(selectedWidget.config);
    const nextQuery = buildQueryConfig({ ...selectedWidget.config, query: { ...currentQuery, metrics } });
    form.setFieldValue('query', nextQuery);
    updateWidgetConfig(selectedWidget.id, { query: nextQuery });
  };

  const changeQueryOptions = (patch: Partial<DatasetQueryConfig>) => {
    const currentQuery = selectedWidget.config.query ?? buildQueryConfig(selectedWidget.config);
    const nextQuery = buildQueryConfig({ ...selectedWidget.config, query: { ...currentQuery, ...patch } });
    form.setFieldValue('query', nextQuery);
    updateWidgetConfig(selectedWidget.id, { query: nextQuery });
  };

  const changePrimarySort = (patch: Partial<QuerySort>) => {
    const current = selectedWidget.config.query?.sorts?.[0] ?? { field: '', order: 'desc' as const };
    const next = { ...current, ...patch };
    changeQueryOptions({ sorts: next.field ? [next] : [] });
  };

  const canUpdatePreview = previewValidation.canPreview;

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
            <div className="query-builder-flow">
              <section className="config-section query-builder-section">
                <div className="query-builder-section-header">
                  <Typography.Text className="config-section-title">1 数据集</Typography.Text>
                  <Tag color={selectedWidget.config.datasetId ? 'green' : 'default'}>
                    {selectedWidget.config.datasetId ? '已选择' : '未选择'}
                  </Tag>
                </div>
                <div className="query-builder-summary-grid">
                  <div className="query-builder-summary-item">
                    <span>组件类型</span>
                    <strong>{chartTypeLabels[selectedWidget.type]}</strong>
                  </div>
                  <div className="query-builder-summary-item">
                    <span>数据源类型</span>
                    <strong>{selectedWidget.config.datasetType ? datasetTypeLabels[selectedWidget.config.datasetType] : '未选择'}</strong>
                  </div>
                  <div className="query-builder-summary-item query-builder-summary-item-wide">
                    <span>数据集</span>
                    <strong>{selectedWidget.config.datasetName ?? '请在右侧数据源配置中选择'}</strong>
                  </div>
                </div>
              </section>

              <section className="config-section query-builder-section">
                <div className="query-builder-section-header">
                  <Typography.Text className="config-section-title">2 字段</Typography.Text>
                  <Tag>
                    维度 {chartDefinition.minDimensions} / 指标 {chartDefinition.minMeasures}
                  </Tag>
                </div>
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
              </section>

              <section className="config-section query-builder-section">
                <Typography.Text className="config-section-title">3 聚合</Typography.Text>
                {(selectedWidget.config.measures ?? []).length ? (
                  (selectedWidget.config.measures ?? []).map((field) => (
                    <div key={field} className="query-option-row">
                      <Typography.Text className="query-option-label">{selectedWidget.config.fieldLabels?.[field] ?? field}</Typography.Text>
                      <Select
                        aria-label={`${selectedWidget.config.fieldLabels?.[field] ?? field} 聚合方式`}
                        value={metricAggregationFor(selectedWidget.config, field)}
                        options={aggregationOptions}
                        onChange={(value) => changeMetricAggregation(field, value as MetricAggregation)}
                      />
                    </div>
                  ))
                ) : (
                  <Typography.Text className="query-builder-muted" type="secondary">
                    选择指标字段后可配置聚合方式。明细表等无指标组件会跳过聚合。
                  </Typography.Text>
                )}
              </section>

              <section className="config-section query-builder-section">
                <Typography.Text className="config-section-title">4 过滤排序 TopN</Typography.Text>
                <div className="query-option-row">
                  <Typography.Text className="query-option-label">排序字段</Typography.Text>
                  <Select
                    allowClear
                    value={selectedWidget.config.query?.sorts?.[0]?.field}
                    placeholder="不排序"
                    options={queryFieldOptions(selectedWidget.config)}
                    onChange={(field) => changePrimarySort({ field: field ? String(field) : '' })}
                  />
                </div>
                <div className="query-option-row">
                  <Typography.Text className="query-option-label">排序方向</Typography.Text>
                  <Select
                    value={selectedWidget.config.query?.sorts?.[0]?.order ?? 'desc'}
                    disabled={!selectedWidget.config.query?.sorts?.[0]?.field}
                    options={[
                      { value: 'desc', label: '降序' },
                      { value: 'asc', label: '升序' }
                    ]}
                    onChange={(order) => changePrimarySort({ order: order as QuerySort['order'] })}
                  />
                </div>
                <div className="query-number-grid">
                  <div>
                    <Typography.Text className="query-option-label">TopN</Typography.Text>
                    <InputNumber
                      className="full-width"
                      min={0}
                      max={5000}
                      value={selectedWidget.config.query?.topN ?? 0}
                      onChange={(value) => changeQueryOptions({ topN: Number(value ?? 0) })}
                    />
                  </div>
                  <div>
                    <Typography.Text className="query-option-label">Limit</Typography.Text>
                    <InputNumber
                      className="full-width"
                      min={1}
                      max={5000}
                      value={selectedWidget.config.query?.limit ?? 500}
                      onChange={(value) => changeQueryOptions({ limit: Number(value ?? 500) })}
                    />
                  </div>
                </div>
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
                {!canUpdatePreview && previewValidation.reasons.length > 0 && (
                  <Alert className="inline-alert preview-query-alert" type="warning" showIcon message="图表配置不完整" description={previewValidation.reasons.join('；')} />
                )}
                {runtimeRows.length ? (
                  <Typography.Text className="preview-data-status" type="secondary">
                    已加载 {runtimeRows.length} 条数据
                  </Typography.Text>
                ) : null}
                {queryError && <Alert className="inline-alert preview-query-alert" type="error" showIcon message="数据查询失败" description={queryError} />}
              </section>

              <section className="config-section query-builder-section">
                <Typography.Text className="config-section-title">5 样式</Typography.Text>
                <Form.Item name="title" label="图表标题" rules={[{ required: true, message: '请输入标题' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="theme" label="主题">
                  <Select
                    options={[
                      { value: 'default', label: '默认' },
                      { value: 'business', label: '商务蓝' },
                      { value: 'fresh', label: '清新绿' },
                      { value: 'contrast', label: '高对比' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="labelSize" label="标签大小">
                  <InputNumber className="full-width" min={10} max={24} step={1} addonAfter="px" />
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

              <section className="config-section query-builder-section">
                <Typography.Text className="config-section-title">联动设置</Typography.Text>
                <div className="config-switch-list">
                  <div className="config-switch-item">
                    <span>参与联动</span>
                    <Form.Item name="enableLinkage" valuePropName="checked" noStyle>
                      <Switch />
                    </Form.Item>
                  </div>
                </div>
                <Form.Item name="linkageMode" label="联动方式">
                  <Select
                    options={[
                      { value: 'filter', label: '筛选联动' },
                      { value: 'highlight', label: '高亮联动' }
                    ]}
                  />
                </Form.Item>
              </section>
            </div>
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
                { value: 'direct', label: datasetTypeLabels.direct },
                { value: 'sql', label: datasetTypeLabels.sql }
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

const aggregationOptions: Array<{ value: MetricAggregation; label: string }> = [
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均' },
  { value: 'count', label: '计数' },
  { value: 'min', label: '最小值' },
  { value: 'max', label: '最大值' }
];

function validatePreviewRequirements(widget: ChartWidget, fields: DatasetFieldSet | null): { canPreview: boolean; reasons: string[] } {
  const definition = getChartDefinition(widget.type);
  if (!definition.requiresDataset) {
    return { canPreview: true, reasons: [] };
  }
  const reasons: string[] = [];
  if (!widget.config.datasetId) {
    reasons.push('请选择数据集');
  }
  if ((widget.config.dimensions ?? []).length < definition.minDimensions) {
    reasons.push(`${chartTypeLabels[widget.type]} 至少需要 ${definition.minDimensions} 个维度`);
  }
  if ((widget.config.measures ?? []).length < definition.minMeasures) {
    reasons.push(`${chartTypeLabels[widget.type]} 至少需要 ${definition.minMeasures} 个指标`);
  }
  if (widget.config.datasetId && !fields) {
    reasons.push('字段元信息尚未加载完成');
  }
  if (fields) {
    const names = new Set([...fields.dimensions, ...fields.measures].map((field) => field.name));
    const missing = [...(widget.config.dimensions ?? []), ...(widget.config.measures ?? [])].filter((field) => !names.has(field));
    if (missing.length > 0) {
      reasons.push(`字段不存在或已变更：${missing.join('、')}`);
    }
  }
  return { canPreview: reasons.length === 0, reasons };
}

function metricAggregationFor(config: ChartConfig, field: string): MetricAggregation {
  return config.query?.metrics?.find((metric) => metric.field === field)?.aggregation ?? 'sum';
}

function queryFieldOptions(config: ChartConfig): Array<{ value: string; label: string }> {
  return [...(config.dimensions ?? []), ...(config.measures ?? [])].map((field) => ({
    value: field,
    label: config.fieldLabels?.[field] ?? field
  }));
}

function buildQueryConfig(config: ChartConfig): DatasetQueryConfig {
  const currentMetrics = new Map((config.query?.metrics ?? []).map((metric) => [metric.field, metric]));
  const dimensions = config.dimensions ?? [];
  const measures = config.measures ?? [];
  const validSortFields = new Set([...dimensions, ...measures]);
  return {
    dimensions,
    metrics: measures.map((field) => ({
      field,
      aggregation: currentMetrics.get(field)?.aggregation ?? 'sum',
      alias: currentMetrics.get(field)?.alias ?? field
    })),
    filters: config.query?.filters ?? [],
    sorts: (config.query?.sorts ?? []).filter((sort) => validSortFields.has(sort.field)),
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
