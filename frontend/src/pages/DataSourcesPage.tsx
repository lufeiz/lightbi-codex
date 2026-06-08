import { CheckCircleOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { hasProjectWriteAccess, useWorkspaceStore } from '@/store/workspaceStore';
import type { DataSourceMutationPayload, DataSourceSummary } from '@/types/domain';
import { dataSourceStatusLabels, dataSourceTypeLabels } from '@/types/domain';

export function DataSourcesPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<DataSourceMutationPayload>();
  const [items, setItems] = useState<DataSourceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataSourceSummary | null>(null);
  const user = useAuthStore((state) => state.user);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectRole = useWorkspaceStore((state) => state.projectRole);
  const canWrite = hasProjectWriteAccess(user, projectRole);
  const createDisabledReason = !projectId ? '请先创建或选择项目' : !canWrite ? '当前项目无写权限' : '';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.dataSources({ workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined }));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载数据源失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, workspaceId]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const openModal = (item?: DataSourceSummary) => {
    setEditing(item ?? null);
    form.setFieldsValue({
      name: item?.name ?? '',
      type: item?.type ?? 'mysql',
      status: item?.status ?? 'active',
      description: item?.description ?? '',
      host: item?.host ?? '127.0.0.1',
      port: item?.port ?? 3306,
      databaseName: item?.databaseName ?? '',
      username: item?.username ?? '',
      password: '',
      sslMode: item?.sslMode ?? 'disable',
      maxOpenConns: item?.maxOpenConns ?? 5,
      maxIdleConns: item?.maxIdleConns ?? 2,
      connMaxLifetimeSecs: item?.connMaxLifetimeSecs ?? 300
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = { ...values, workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined };
      if (editing) {
        await api.updateDataSource(editing.id, payload);
        message.success('数据源已更新');
      } else {
        await api.createDataSource(payload);
        message.success('数据源已创建');
      }
      setModalOpen(false);
      await fetchItems();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存数据源失败');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (item: DataSourceSummary) => {
    setTestingId(item.id);
    try {
      await api.testDataSource(item.id);
      message.success('连接测试通过');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '连接测试失败');
    } finally {
      setTestingId(null);
    }
  };

  const deleteItem = (item: DataSourceSummary) => {
    Modal.confirm({
      title: `删除数据源「${item.name}」？`,
      content: '已被数据集使用的数据源不能删除。',
      okButtonProps: { danger: true },
      onOk: async () => {
        await api.deleteDataSource(item.id);
        message.success('数据源已删除');
        await fetchItems();
      }
    });
  };

  const columns: ColumnsType<DataSourceSummary> = [
    { title: '名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'type', render: (type) => dataSourceTypeLabels[type as DataSourceSummary['type']] },
    { title: '主机', render: (_, item) => `${item.host}:${item.port}/${item.databaseName}` },
    { title: '用户', dataIndex: 'username' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status) => <Tag color={status === 'active' ? 'green' : 'default'}>{dataSourceStatusLabels[status as DataSourceSummary['status']]}</Tag>
    },
    {
      title: '操作',
      width: 230,
      render: (_, item) => (
        <Space>
          <Button size="small" icon={<CheckCircleOutlined />} loading={testingId === item.id} disabled={!canWrite} onClick={() => void testConnection(item)}>
            测试
          </Button>
          <Button size="small" icon={<EditOutlined />} disabled={!canWrite} onClick={() => openModal(item)}>
            编辑
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
          <Typography.Title level={3}>数据源管理</Typography.Title>
          <Typography.Text type="secondary">维护 MySQL 和 PostgreSQL 外部分析数据源。</Typography.Text>
        </div>
        <Space direction="vertical" size={2} align="end">
          <Tooltip title={createDisabledReason}>
            <span>
              <Button type="primary" icon={<PlusOutlined />} disabled={Boolean(createDisabledReason)} onClick={() => openModal()}>
                新建数据源
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
      <Table rowKey="id" loading={loading} columns={columns} dataSource={items} pagination={false} />

      <Modal title={editing ? '编辑数据源' : '新建数据源'} open={modalOpen} okText="保存" confirmLoading={saving} onOk={() => void submit()} onCancel={() => setModalOpen(false)}>
        <Form<DataSourceMutationPayload> form={form} layout="vertical" className="asset-form">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input prefix={<DatabaseOutlined />} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="type" label="类型" rules={[{ required: true }]} className="compact-form-item">
              <Select
                options={[
                  { value: 'mysql', label: dataSourceTypeLabels.mysql },
                  { value: 'postgres', label: dataSourceTypeLabels.postgres }
                ]}
              />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]} className="compact-form-item">
              <Select
                options={[
                  { value: 'active', label: dataSourceStatusLabels.active },
                  { value: 'disabled', label: dataSourceStatusLabels.disabled }
                ]}
              />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="host" label="Host" rules={[{ required: true }]} className="compact-form-item">
              <Input />
            </Form.Item>
            <Form.Item name="port" label="Port" rules={[{ required: true }]} className="compact-form-item">
              <InputNumber min={1} max={65535} className="full-width-control" />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="databaseName" label="数据库" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="username" label="用户名" rules={[{ required: true }]} className="compact-form-item">
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label={editing ? '密码（留空不修改）' : '密码'} rules={editing ? [] : [{ required: true, message: '请输入密码' }]} className="compact-form-item">
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="sslMode" label="SSL Mode" className="compact-form-item">
              <Input />
            </Form.Item>
            <Form.Item name="maxOpenConns" label="最大连接" className="compact-form-item">
              <InputNumber min={1} className="full-width-control" />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="maxIdleConns" label="空闲连接" className="compact-form-item">
              <InputNumber min={1} className="full-width-control" />
            </Form.Item>
            <Form.Item name="connMaxLifetimeSecs" label="连接寿命秒" className="compact-form-item">
              <InputNumber min={30} className="full-width-control" />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
