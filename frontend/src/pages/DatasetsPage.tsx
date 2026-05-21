import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import type { DataRow, DataSourceSummary, DatasetField, DatasetMutationPayload, DatasetSummary } from '@/types/domain';
import { datasetTypeLabels } from '@/types/domain';

interface DatasetFormValues extends Omit<DatasetMutationPayload, 'dimensions' | 'measures'> {
  dimensionsText: string;
  measuresText: string;
}

export function DatasetsPage() {
  const [form] = Form.useForm<DatasetFormValues>();
  const [items, setItems] = useState<DatasetSummary[]>([]);
  const [sources, setSources] = useState<DataSourceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DatasetSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<DataRow[]>([]);
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === 'admin' || user?.role === 'editor';
  const sourceOptions = useMemo(() => sources.map((source) => ({ value: source.id, label: `${source.name} · ${source.type}` })), [sources]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [datasetData, sourceData] = await Promise.all([api.datasets(), api.dataSources()]);
      setItems(datasetData);
      setSources(sourceData);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载数据集失败');
    } finally {
      setLoading(false);
    }
  }, []);

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
        dimensionsText: 'region,区域,string',
        measuresText: 'revenue,收入,number',
        cacheTtl: 300,
        refreshEvery: 0,
        queryTimeout: 10,
        rowLimit: 500
      });
    }
    setModalOpen(true);
  };

  const buildPayload = async (): Promise<DatasetMutationPayload> => {
    const values = await form.validateFields();
    return {
      name: values.name,
      type: values.type,
      description: values.description ?? '',
      sourceName: values.sourceName ?? '',
      dataSourceId: values.dataSourceId ?? null,
      querySql: values.querySql ?? '',
      dimensions: parseFields(values.dimensionsText),
      measures: parseFields(values.measuresText),
      cacheTtl: values.cacheTtl ?? 300,
      refreshEvery: values.refreshEvery ?? 0,
      queryTimeout: values.queryTimeout ?? 10,
      rowLimit: values.rowLimit ?? 500
    };
  };

  const submit = async () => {
    const payload = await buildPayload();
    setSaving(true);
    try {
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

  const preview = async () => {
    const payload = await buildPayload();
    if (!editing) {
      message.warning('请先保存数据集再预览');
      return;
    }
    try {
      const result = await api.previewDataset(editing.id, {
        dimensions: payload.dimensions.slice(0, 1).map((field) => field.name),
        metrics: payload.measures.slice(0, 1).map((field) => ({ field: field.name, aggregation: 'sum', alias: field.name })),
        limit: 20
      });
      setPreviewRows(result.rows);
      message.success('预览已更新');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '预览失败');
    }
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
        <Button type="primary" icon={<PlusOutlined />} disabled={!canWrite} onClick={() => void openModal()}>
          新建数据集
        </Button>
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
            <Form.Item name="dimensionsText" label="维度字段 name,label,type" rules={[{ required: true }]} className="compact-form-item">
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item name="measuresText" label="指标字段 name,label,type" rules={[{ required: true }]} className="compact-form-item">
              <Input.TextArea rows={4} />
            </Form.Item>
          </Space.Compact>
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
          {editing && (
            <Button icon={<EyeOutlined />} onClick={() => void preview()}>
              预览查询
            </Button>
          )}
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
