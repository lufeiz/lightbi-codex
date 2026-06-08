import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { hasProjectWriteAccess, useWorkspaceStore } from '@/store/workspaceStore';
import type { DataRow, DataSourceSummary, DatasetField, DatasetMutationPayload, DatasetQueryColumn, DatasetSummary } from '@/types/domain';
import { datasetTypeLabels } from '@/types/domain';

interface DatasetFormValues extends Omit<DatasetMutationPayload, 'dimensions' | 'measures'> {
  dimensionsText: string;
  measuresText: string;
}

export function DatasetsPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<DatasetFormValues>();
  const [items, setItems] = useState<DatasetSummary[]>([]);
  const [sources, setSources] = useState<DataSourceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DatasetSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<DataRow[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [detectingFields, setDetectingFields] = useState(false);
  const user = useAuthStore((state) => state.user);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectRole = useWorkspaceStore((state) => state.projectRole);
  const canWrite = hasProjectWriteAccess(user, projectRole);
  const createDisabledReason = !projectId ? '请先创建或选择项目' : !canWrite ? '当前项目无写权限' : '';
  const sourceOptions = useMemo(() => sources.map((source) => ({ value: source.id, label: `${source.name} · ${source.type}` })), [sources]);
  const dimensionsText = Form.useWatch('dimensionsText', form) ?? '';
  const measuresText = Form.useWatch('measuresText', form) ?? '';
  const parsedFieldRows = useMemo(
    () => [
      ...parseFields(dimensionsText).map((field) => ({ ...field, role: '维度' })),
      ...parseFields(measuresText).map((field) => ({ ...field, role: '指标' }))
    ],
    [dimensionsText, measuresText]
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const scope = { workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined };
      const [datasetData, sourceData] = await Promise.all([api.datasets(undefined, scope), api.dataSources(scope)]);
      setItems(datasetData);
      setSources(sourceData);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载数据集失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, workspaceId]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const openModal = async (item?: DatasetSummary) => {
    setEditing(item ?? null);
    setPreviewRows([]);
    if (item) {
      const detail = await api.dataset(item.id);
      form.setFieldsValue({
        name: detail.name,
        type: detail.type,
        description: detail.description,
        sourceName: detail.sourceName,
        dataSourceId: detail.dataSourceId ?? undefined,
        querySql: detail.querySql ?? '',
        dimensionsText: fieldsToText(detail.dimensions),
        measuresText: fieldsToText(detail.measures),
        cacheTtl: detail.cacheTtl ?? 300,
        refreshEvery: detail.refreshEvery ?? 0,
        queryTimeout: detail.queryTimeout ?? 10,
        rowLimit: detail.rowLimit ?? 500
      });
    } else {
      form.setFieldsValue({
        name: '',
        type: 'sql',
        description: '',
        sourceName: '',
        querySql: 'SELECT * FROM table_name',
        dimensionsText: '',
        measuresText: '',
        cacheTtl: 300,
        refreshEvery: 0,
        queryTimeout: 10,
        rowLimit: 500
      });
    }
    setModalOpen(true);
  };

  const buildPayload = async (requireFields = true): Promise<DatasetMutationPayload> => {
    if (requireFields) {
      await form.validateFields();
    } else {
      await form.validateFields(['name', 'type', 'dataSourceId', 'sourceName', 'querySql', 'cacheTtl', 'refreshEvery', 'queryTimeout', 'rowLimit', 'description']);
    }
    const values = form.getFieldsValue();
    const dimensions = parseFields(values.dimensionsText ?? '');
    const measures = parseFields(values.measuresText ?? '');
    if (requireFields && dimensions.length === 0 && measures.length === 0) {
      form.setFields([
        { name: 'dimensionsText', errors: ['请先测试 SQL 并确认字段'] },
        { name: 'measuresText', errors: ['请先测试 SQL 并确认字段'] }
      ]);
      throw new Error('请先测试 SQL 并确认字段');
    }
    return {
      workspaceId: workspaceId ?? undefined,
      projectId: projectId ?? undefined,
      name: values.name,
      type: values.type,
      description: values.description ?? '',
      sourceName: values.sourceName ?? '',
      dataSourceId: values.dataSourceId ?? null,
      querySql: values.querySql ?? '',
      dimensions,
      measures,
      cacheTtl: values.cacheTtl ?? 300,
      refreshEvery: values.refreshEvery ?? 0,
      queryTimeout: values.queryTimeout ?? 10,
      rowLimit: values.rowLimit ?? 500
    };
  };

  const submit = async () => {
    setSaving(true);
    try {
      const payload = await buildPayload();
      if (editing) {
        await api.updateDataset(editing.id, payload);
        message.success('数据集已更新');
      } else {
        await api.createDataset(payload);
        message.success('数据集已创建');
      }
      setModalOpen(false);
      await fetchItems();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存数据集失败');
    } finally {
      setSaving(false);
    }
  };

  const detectFields = async () => {
    setDetectingFields(true);
    try {
      const payload = await buildPayload(false);
      const result = await api.previewDatasetDraft({ ...payload, dimensions: [], measures: [] }, { dimensions: [], metrics: [], limit: 20 });
      applyInferredFields(result.columns);
      setPreviewRows(result.rows);
      message.success(`SQL 测试通过，已识别 ${result.columns.length} 个字段`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'SQL 测试失败');
    } finally {
      setDetectingFields(false);
    }
  };

  const preview = async () => {
    setPreviewing(true);
    try {
      const payload = await buildPayload(false);
      const result = editing
        ? await api.previewDataset(editing.id, buildPreviewQuery(payload))
        : await api.previewDatasetDraft({ ...payload, dimensions: [], measures: [] }, { dimensions: [], metrics: [], limit: 20 });
      if (!editing && result.columns.length > 0) {
        applyInferredFields(result.columns);
      }
      setPreviewRows(result.rows);
      message.success('预览已更新');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '预览失败');
    } finally {
      setPreviewing(false);
    }
  };

  const applyInferredFields = (columns: DatasetQueryColumn[]) => {
    const fields = columns.map((column) => ({ name: column.name, label: column.label || column.name, type: normalizeDatasetFieldType(column.type), role: column.role }));
    const dimensions = fields.filter((field) => field.role === 'dimension');
    const measures = fields.filter((field) => field.role === 'measure');
    form.setFieldsValue({
      dimensionsText: fieldsToText(dimensions),
      measuresText: fieldsToText(measures)
    });
  };

  const deleteItem = (item: DatasetSummary) => {
    Modal.confirm({
      title: `删除数据集「${item.name}」？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        await api.deleteDataset(item.id);
        message.success('数据集已删除');
        await fetchItems();
      }
    });
  };

  const columns: ColumnsType<DatasetSummary> = [
    { title: '名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'type', render: (type) => <Tag>{datasetTypeLabels[type as DatasetSummary['type']]}</Tag> },
    { title: '来源', dataIndex: 'sourceName' },
    { title: '缓存秒', dataIndex: 'cacheTtl' },
    { title: '超时秒', dataIndex: 'queryTimeout' },
    {
      title: '操作',
      width: 230,
      render: (_, item) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} disabled={!canWrite} onClick={() => void openModal(item)}>
            编辑
          </Button>
          <Button size="small" icon={<ReloadOutlined />} disabled={!canWrite} onClick={() => api.refreshDataset(item.id).then(() => message.success('缓存已刷新'))}>
            刷新
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={!canWrite} onClick={() => deleteItem(item)} />
        </Space>
      )
    }
  ];

  return (
    <main className="asset-page">
      <div className="asset-page-header">
        <div>
          <Typography.Title level={3}>数据集管理</Typography.Title>
          <Typography.Text type="secondary">维护 SQL 数据集、字段元数据和查询缓存策略。</Typography.Text>
        </div>
        <Space direction="vertical" size={2} align="end">
          <Tooltip title={createDisabledReason}>
            <span>
              <Button type="primary" icon={<PlusOutlined />} disabled={Boolean(createDisabledReason)} onClick={() => void openModal()}>
                新建数据集
              </Button>
            </span>
          </Tooltip>
          {createDisabledReason && (
            <Typography.Text type="secondary" className="asset-action-hint">
              {createDisabledReason}
              {!projectId && (
                <Button type="link" size="small" onClick={() => navigate('/workspaces')}>
                  去创建项目
                </Button>
              )}
            </Typography.Text>
          )}
        </Space>
      </div>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={items} />

      <Modal width={920} title={editing ? '编辑数据集' : '新建数据集'} open={modalOpen} okText="保存" confirmLoading={saving} onOk={() => void submit()} onCancel={() => setModalOpen(false)}>
        <Form<DatasetFormValues> form={form} layout="vertical" className="asset-form">
          <Space.Compact block>
            <Form.Item name="name" label="名称" rules={[{ required: true }]} className="compact-form-item">
              <Input />
            </Form.Item>
            <Form.Item name="type" label="类型" rules={[{ required: true }]} className="compact-form-item">
              <Select options={[{ value: 'sql', label: datasetTypeLabels.sql }]} />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="dataSourceId" label="数据源" rules={[{ required: true, message: '请选择数据源' }]} className="compact-form-item">
              <Select showSearch optionFilterProp="label" options={sourceOptions} />
            </Form.Item>
            <Form.Item name="sourceName" label="来源名称" className="compact-form-item">
              <Input />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="querySql" label="只读 SQL" rules={[{ required: true }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="dimensionsText" label="维度字段 name,label,type" className="compact-form-item">
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item name="measuresText" label="指标字段 name,label,type" className="compact-form-item">
              <Input.TextArea rows={4} />
            </Form.Item>
          </Space.Compact>
          {parsedFieldRows.length > 0 && (
            <Table
              className="dataset-field-confirm-table"
              size="small"
              rowKey={(row) => `${row.role}-${row.name}`}
              dataSource={parsedFieldRows}
              columns={[
                { title: '角色', dataIndex: 'role', width: 80 },
                { title: '字段名', dataIndex: 'name' },
                { title: '显示名', dataIndex: 'label' },
                { title: '类型', dataIndex: 'type', width: 100 }
              ]}
              pagination={false}
            />
          )}
          {parsedFieldRows.length === 0 && (
            <Typography.Text type="secondary">尚未识别字段</Typography.Text>
          )}
          <Space.Compact block>
            <Form.Item name="cacheTtl" label="缓存秒" className="compact-form-item">
              <InputNumber min={0} className="full-width-control" />
            </Form.Item>
            <Form.Item name="refreshEvery" label="刷新间隔秒" className="compact-form-item">
              <InputNumber min={0} className="full-width-control" />
            </Form.Item>
            <Form.Item name="queryTimeout" label="查询超时秒" className="compact-form-item">
              <InputNumber min={1} className="full-width-control" />
            </Form.Item>
            <Form.Item name="rowLimit" label="最大行数" className="compact-form-item">
              <InputNumber min={1} max={5000} className="full-width-control" />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space wrap>
            {!editing && (
              <Button icon={<ReloadOutlined />} loading={detectingFields} onClick={() => void detectFields()}>
                测试 SQL 并识别字段
              </Button>
            )}
            <Button icon={<EyeOutlined />} loading={previewing} onClick={() => void preview()}>
              {editing ? '预览查询' : '预览前 20 行'}
            </Button>
          </Space>
          {previewRows.length > 0 && (
            <Table
              className="dataset-preview-table"
              size="small"
              rowKey={(_, index) => String(index)}
              dataSource={previewRows}
              columns={Object.keys(previewRows[0] ?? {}).map((key) => ({ title: key, dataIndex: key }))}
              pagination={false}
            />
          )}
        </Form>
      </Modal>
    </main>
  );
}

function fieldsToText(fields: DatasetField[]): string {
  return fields.map((field) => [field.name, field.label, field.type].join(',')).join('\n');
}

function parseFields(text: string): DatasetField[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, label, type] = line.split(',').map((part) => part.trim());
      return { name, label: label || name, type: type === 'number' || type === 'date' ? type : 'string' };
    });
}

function normalizeDatasetFieldType(type: string): DatasetField['type'] {
  if (type === 'number' || type === 'date') {
    return type;
  }
  return 'string';
}

function buildPreviewQuery(payload: DatasetMutationPayload) {
  return {
    dimensions: payload.dimensions.slice(0, 1).map((field) => field.name),
    metrics: payload.measures.slice(0, 1).map((field) => ({ field: field.name, aggregation: 'sum' as const, alias: field.name })),
    limit: 20
  };
}
