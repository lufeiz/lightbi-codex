import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, HistoryOutlined, LinkOutlined, RollbackOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Button, DatePicker, Drawer, Form, Input, message, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@/api/client';
import type { AuditLogEntry, ChartVersion, DashboardShareLink, DashboardSubscription, SubscriptionFrequency, SubscriptionFormat } from '@/types/domain';

interface DashboardGovernancePanelProps {
  chartId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRollback?: () => void;
}

interface ShareFormValues {
  name: string;
  enabled: boolean;
  allowEmbed: boolean;
  expiresAt?: Dayjs | null;
}

interface SubscriptionFormValues {
  name: string;
  format: SubscriptionFormat;
  frequency: SubscriptionFrequency;
  enabled: boolean;
}

export function DashboardGovernancePanel({ chartId, open, onOpenChange, onRollback }: DashboardGovernancePanelProps) {
  const [shareForm] = Form.useForm<ShareFormValues>();
  const [editShareForm] = Form.useForm<ShareFormValues>();
  const [subscriptionForm] = Form.useForm<SubscriptionFormValues>();
  const [versions, setVersions] = useState<ChartVersion[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [shareLinks, setShareLinks] = useState<DashboardShareLink[]>([]);
  const [subscriptions, setSubscriptions] = useState<DashboardSubscription[]>([]);
  const [editingShareLink, setEditingShareLink] = useState<DashboardShareLink | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!chartId || !open) {
      return;
    }
    setLoading(true);
    try {
      const [versionData, auditData, linkData, subscriptionData] = await Promise.all([
        api.chartVersions(chartId),
        api.chartAuditLogs(chartId),
        api.shareLinks(chartId),
        api.subscriptions(chartId)
      ]);
      setVersions(versionData);
      setAuditLogs(auditData);
      setShareLinks(linkData);
      setSubscriptions(subscriptionData);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载治理信息失败');
    } finally {
      setLoading(false);
    }
  }, [chartId, open]);

  useEffect(() => {
    void load();
  }, [load]);

  const rollback = (version: ChartVersion) => {
    if (!chartId) {
      return;
    }
    Modal.confirm({
      title: `回滚到版本 ${version.version}？`,
      content: '当前编辑内容会被该版本快照覆盖。',
      onOk: async () => {
        await api.rollbackChart(chartId, version.id);
        message.success('已回滚版本');
        onRollback?.();
        await load();
      }
    });
  };

  const createShareLink = async () => {
    if (!chartId) {
      return;
    }
    const values = await shareForm.validateFields();
    const link = await api.createShareLink(chartId, sharePayload(values));
    setShareLinks((items) => [link, ...items.filter((item) => item.id !== link.id)]);
    shareForm.resetFields();
    message.success('分享链接已创建');
    await load();
  };

  const openShareEditor = (link: DashboardShareLink) => {
    setEditingShareLink(link);
    editShareForm.setFieldsValue({
      name: link.name,
      enabled: link.enabled,
      allowEmbed: link.allowEmbed,
      expiresAt: link.expiresAt ? dayjs(link.expiresAt) : null
    });
  };

  const saveShareLink = async () => {
    if (!chartId || !editingShareLink) {
      return;
    }
    const values = await editShareForm.validateFields();
    const link = await api.updateShareLink(chartId, editingShareLink.id, sharePayload(values));
    setShareLinks((items) => items.map((item) => (item.id === link.id ? link : item)));
    setEditingShareLink(null);
    message.success('分享链接已更新');
    await load();
  };

  const deleteShareLink = (link: DashboardShareLink) => {
    if (!chartId) {
      return;
    }
    Modal.confirm({
      title: `删除分享链接「${link.name}」？`,
      content: '删除后该公开 URL 和嵌入代码将立即失效。',
      onOk: async () => {
        await api.deleteShareLink(chartId, link.id);
        setShareLinks((items) => items.filter((item) => item.id !== link.id));
        message.success('分享链接已删除');
        await load();
      }
    });
  };

  const copyShareURL = async (link: DashboardShareLink) => {
    if (!link.token) {
      message.warning('该链接缺少完整 token，请重新生成分享链接');
      return;
    }
    await copyText(`${window.location.origin}/share/${link.token}`, '分享 URL 已复制');
  };

  const copyEmbedCode = async (link: DashboardShareLink) => {
    if (!link.token) {
      message.warning('该链接缺少完整 token，请重新生成分享链接');
      return;
    }
    if (!link.allowEmbed) {
      message.warning('该分享链接未启用嵌入');
      return;
    }
    const src = `${window.location.origin}/embed/${link.token}`;
    await copyText(`<iframe src="${src}" title="${escapeAttribute(link.name)}" width="100%" height="720" frameborder="0" allowfullscreen></iframe>`, 'Embed code 已复制');
  };

  const createSubscription = async () => {
    if (!chartId) {
      return;
    }
    const values = await subscriptionForm.validateFields();
    await api.createSubscription(chartId, values);
    message.success('订阅已创建');
    await load();
  };

  const runSubscription = async (subscription: DashboardSubscription) => {
    await api.runSubscription(subscription.id);
    message.success('订阅已手动运行');
    await load();
  };

  const exportCsv = async () => {
    if (!chartId) {
      return;
    }
    const result = await api.exportChart(chartId, { format: 'csv' });
    downloadText(result.filename, result.content ?? '', result.mimeType);
    message.success('CSV 已导出');
  };

  const exportPng = async () => {
    if (!chartId) {
      return;
    }
    const result = await api.exportChart(chartId, { format: 'png' });
    const target = document.querySelector<HTMLElement>('.editor-canvas-shell, .published-dashboard-canvas');
    if (!target) {
      message.warning('当前页面没有可导出的画布');
      return;
    }
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(target, { cacheBust: true, pixelRatio: 2 });
    downloadUrl(result.filename, dataUrl);
    message.success('PNG 已导出');
  };

  const versionColumns: ColumnsType<ChartVersion> = [
    { title: '版本', dataIndex: 'version', width: 80, render: (value) => <Tag color="blue">v{value}</Tag> },
    { title: '名称', dataIndex: 'name' },
    { title: '发布人', render: (_, item) => item.publisher?.displayName ?? item.publishedBy },
    { title: '时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() },
    {
      title: '操作',
      width: 100,
      render: (_, item) => (
        <Button size="small" icon={<RollbackOutlined />} onClick={() => rollback(item)}>
          回滚
        </Button>
      )
    }
  ];

  const shareColumns: ColumnsType<DashboardShareLink> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (value, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">Token {item.tokenPrefix || '-'}</Typography.Text>
        </Space>
      )
    },
    { title: '状态', dataIndex: 'enabled', width: 92, render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag> },
    { title: '嵌入', dataIndex: 'allowEmbed', width: 92, render: (value) => <Tag color={value ? 'blue' : 'default'}>{value ? '允许' : '禁止'}</Tag> },
    { title: '过期时间', dataIndex: 'expiresAt', width: 190, render: (_, item) => renderShareExpiry(item) },
    {
      title: '操作',
      width: 330,
      render: (_, item) => (
        <Space wrap size={6}>
          <Button size="small" icon={<CopyOutlined />} disabled={!item.token} onClick={() => void copyShareURL(item)}>
            复制 URL
          </Button>
          <Button size="small" icon={<CopyOutlined />} disabled={!item.token || !item.allowEmbed} onClick={() => void copyEmbedCode(item)}>
            复制 embed code
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openShareEditor(item)}>
            编辑
          </Button>
          <Button danger size="small" icon={<DeleteOutlined />} onClick={() => deleteShareLink(item)}>
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Drawer width={760} title="发布与治理" open={open} onClose={() => onOpenChange(false)}>
      <Tabs
        items={[
          {
            key: 'versions',
            label: '版本',
            children: <Table rowKey="id" size="small" loading={loading} columns={versionColumns} dataSource={versions} pagination={false} />
          },
          {
            key: 'share',
            label: '分享',
            children: (
              <Space direction="vertical" size={16} className="governance-tab">
                <Form form={shareForm} layout="inline" className="share-create-form" initialValues={{ name: '分享链接', enabled: true, allowEmbed: false, expiresAt: null }}>
                  <Form.Item name="name" rules={[{ required: true, message: '请输入链接名称' }]}>
                    <Input prefix={<ShareAltOutlined />} placeholder="链接名称" />
                  </Form.Item>
                  <Form.Item name="enabled" valuePropName="checked">
                    <Switch checkedChildren="启用" unCheckedChildren="停用" />
                  </Form.Item>
                  <Form.Item name="allowEmbed" valuePropName="checked">
                    <Switch checkedChildren="可嵌入" unCheckedChildren="禁止嵌入" />
                  </Form.Item>
                  <Form.Item name="expiresAt" label="过期时间">
                    <DatePicker showTime allowClear placeholder="永不过期" />
                  </Form.Item>
                  <Button type="primary" icon={<LinkOutlined />} onClick={() => void createShareLink()}>
                    创建
                  </Button>
                </Form>
                <Table
                  className="share-link-table"
                  rowKey="id"
                  size="small"
                  dataSource={shareLinks}
                  pagination={false}
                  columns={shareColumns}
                />
              </Space>
            )
          },
          {
            key: 'export',
            label: '导出',
            children: (
              <Space>
                <Button icon={<DownloadOutlined />} onClick={() => void exportCsv()}>
                  导出 CSV
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => void exportPng()}>
                  导出 PNG
                </Button>
              </Space>
            )
          },
          {
            key: 'subscriptions',
            label: '订阅',
            children: (
              <Space direction="vertical" size={16} className="governance-tab">
                <Form form={subscriptionForm} layout="inline" initialValues={{ name: '应用内订阅', format: 'csv', frequency: 'manual', enabled: true }}>
                  <Form.Item name="name" rules={[{ required: true }]}>
                    <Input placeholder="订阅名称" />
                  </Form.Item>
                  <Form.Item name="format">
                    <Select options={[{ value: 'csv', label: 'CSV' }, { value: 'png', label: 'PNG' }]} />
                  </Form.Item>
                  <Form.Item name="frequency">
                    <Select options={[{ value: 'manual', label: '手动' }, { value: 'daily', label: '每日' }, { value: 'weekly', label: '每周' }]} />
                  </Form.Item>
                  <Form.Item name="enabled" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Button type="primary" onClick={() => void createSubscription()}>
                    创建
                  </Button>
                </Form>
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={subscriptions}
                  pagination={false}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    { title: '格式', dataIndex: 'format' },
                    { title: '频率', dataIndex: 'frequency' },
                    { title: '最近状态', dataIndex: 'lastStatus', render: (value) => value || '-' },
                    { title: '操作', render: (_, item) => <Button size="small" onClick={() => void runSubscription(item)}>运行</Button> }
                  ]}
                />
              </Space>
            )
          },
          {
            key: 'audit',
            label: '审计',
            children: (
              <Table
                rowKey="id"
                size="small"
                dataSource={auditLogs}
                pagination={{ pageSize: 8 }}
                columns={[
                  { title: '动作', dataIndex: 'action' },
                  { title: '摘要', dataIndex: 'summary' },
                  { title: '操作者', render: (_, item) => item.actor?.displayName ?? item.actorId },
                  { title: '时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() }
                ]}
              />
            )
          }
        ]}
      />
      <Modal
        className="share-edit-modal"
        title="编辑分享链接"
        open={Boolean(editingShareLink)}
        onCancel={() => setEditingShareLink(null)}
        onOk={() => void saveShareLink()}
        destroyOnHidden
      >
        <Form form={editShareForm} layout="vertical" initialValues={{ enabled: true, allowEmbed: false, expiresAt: null }}>
          <Form.Item name="name" label="分享名称" rules={[{ required: true, message: '请输入分享名称' }]}>
            <Input aria-label="分享名称" />
          </Form.Item>
          <div className="share-edit-switches">
            <Form.Item name="enabled" label="启用分享" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
            <Form.Item name="allowEmbed" label="允许嵌入" valuePropName="checked">
              <Switch checkedChildren="允许" unCheckedChildren="禁止" />
            </Form.Item>
          </div>
          <Form.Item name="expiresAt" label="过期时间">
            <DatePicker showTime allowClear className="full-width" placeholder="永不过期" />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

function sharePayload(values: ShareFormValues): { name: string; enabled?: boolean; allowEmbed: boolean; expiresAt?: string | null } {
  return {
    name: values.name.trim(),
    enabled: values.enabled,
    allowEmbed: values.allowEmbed,
    expiresAt: values.expiresAt ? values.expiresAt.toISOString() : null
  };
}

function renderShareExpiry(link: DashboardShareLink) {
  if (!link.expiresAt) {
    return <Tag>永不过期</Tag>;
  }
  const expiry = dayjs(link.expiresAt);
  const expired = expiry.isBefore(dayjs());
  return (
    <Space direction="vertical" size={2}>
      <Typography.Text>{expiry.format('YYYY-MM-DD HH:mm')}</Typography.Text>
      <Tag color={expired ? 'red' : 'blue'}>{expired ? '已过期' : '有效期内'}</Tag>
    </Space>
  );
}

async function copyText(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'true');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }
  message.success(successMessage);
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  downloadUrl(filename, url);
  URL.revokeObjectURL(url);
}

function downloadUrl(filename: string, url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}
