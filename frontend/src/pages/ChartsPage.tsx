import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FolderAddOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  TagsOutlined
} from '@ant-design/icons';
import {
  Button,
  Card,
  DatePicker,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import {
  buildGroupTree,
  chartStatusOptions,
  chartTypeOptions,
  formatDateTime,
  groupToSelectOptions
} from '@/features/charts/chartUtils';
import { useAuthStore } from '@/store/authStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ChartAsset, ChartGroup, ChartQuery, ChartTag, UserDTO } from '@/types/domain';
import { chartStatusLabels, chartTypeLabels } from '@/types/domain';

const { RangePicker } = DatePicker;

interface FilterFormValues {
  keyword?: string;
  type?: ChartQuery['type'];
  status?: ChartQuery['status'];
  groupId?: number;
  tagIds?: number[];
  createdBy?: number;
  updatedRange?: [Dayjs, Dayjs];
}

interface GroupFormValues {
  name: string;
  parentId?: number;
  sortOrder?: number;
}

interface TagFormValues {
  name: string;
  color: string;
}

export function ChartsPage() {
  const navigate = useNavigate();
  const [filterForm] = Form.useForm<FilterFormValues>();
  const [groupForm] = Form.useForm<GroupFormValues>();
  const [tagForm] = Form.useForm<TagFormValues>();
  const [charts, setCharts] = useState<ChartAsset[]>([]);
  const [groups, setGroups] = useState<ChartGroup[]>([]);
  const [tags, setTags] = useState<ChartTag[]>([]);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [query, setQuery] = useState<ChartQuery>({ page: 1, pageSize: 12, sortBy: 'updatedAt', sortOrder: 'desc' });
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChartGroup | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<ChartTag | null>(null);
  const user = useAuthStore((state) => state.user);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const canWrite = user?.role === 'admin' || user?.role === 'editor';
  const scope = useMemo(() => ({ workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined }), [projectId, workspaceId]);

  const groupTree = useMemo(() => buildGroupTree(groups), [groups]);
  const groupOptions = useMemo(() => groupToSelectOptions(groups), [groups]);
  const tagOptions = useMemo(() => tags.map((tag) => ({ value: tag.id, label: tag.name })), [tags]);
  const userOptions = useMemo(() => users.map((item) => ({ value: item.id, label: item.displayName })), [users]);

  const fetchDictionaries = useCallback(async () => {
    try {
      const [groupData, tagData, userData] = await Promise.all([api.groups(scope), api.tags(scope), api.chartCreators()]);
      setGroups(groupData);
      setTags(tagData);
      setUsers(userData);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载筛选基础数据失败');
      setGroups([]);
      setTags([]);
      setUsers([]);
    }
  }, [scope]);

  const fetchCharts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.charts({ ...query, ...scope });
      setCharts(data.items);
      setTotal(data.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载仪表盘列表失败');
    } finally {
      setLoading(false);
    }
  }, [query, scope]);

  useEffect(() => {
    void fetchDictionaries();
  }, [fetchDictionaries]);

  useEffect(() => {
    void fetchCharts();
  }, [fetchCharts]);

  useEffect(() => {
    setQuery((current) => ({ ...current, page: 1, groupId: undefined, tagIds: undefined }));
    filterForm.setFieldsValue({ groupId: undefined, tagIds: undefined });
  }, [filterForm, projectId, workspaceId]);

  const handleFilter = (values: FilterFormValues) => {
    setQuery((current) => ({
      ...current,
      page: 1,
      keyword: values.keyword,
      type: values.type,
      status: values.status,
      groupId: values.groupId,
      tagIds: values.tagIds,
      createdBy: values.createdBy,
      updatedFrom: values.updatedRange?.[0]?.startOf('day').toISOString(),
      updatedTo: values.updatedRange?.[1]?.endOf('day').toISOString()
    }));
  };

  const resetFilter = () => {
    filterForm.resetFields();
    setQuery({ page: 1, pageSize: 12, sortBy: 'updatedAt', sortOrder: 'desc' });
  };

  const openGroupModal = (group?: ChartGroup) => {
    setEditingGroup(group ?? null);
    groupForm.setFieldsValue({
      name: group?.name ?? '',
      parentId: group?.parentId ?? undefined,
      sortOrder: group?.sortOrder ?? 0
    });
    setGroupModalOpen(true);
  };

  const submitGroup = async () => {
    const values = await groupForm.validateFields();
    const payload = {
      ...scope,
      name: values.name,
      parentId: values.parentId ?? null,
      sortOrder: values.sortOrder ?? 0
    };
    if (editingGroup) {
      await api.updateGroup(editingGroup.id, payload);
      message.success('目录已更新');
    } else {
      await api.createGroup(payload);
      message.success('目录已创建');
    }
    setGroupModalOpen(false);
    await fetchDictionaries();
  };

  const deleteGroup = (group: ChartGroup) => {
    Modal.confirm({
      title: `删除目录「${group.name}」？`,
      content: '包含子目录或仪表盘的目录不能删除。',
      okButtonProps: { danger: true },
      onOk: async () => {
        await api.deleteGroup(group.id);
        message.success('目录已删除');
        await fetchDictionaries();
      }
    });
  };

  const openTagModal = (tag?: ChartTag) => {
    setEditingTag(tag ?? null);
    tagForm.setFieldsValue({ name: tag?.name ?? '', color: tag?.color ?? '#1677ff' });
    setTagModalOpen(true);
  };

  const submitTag = async () => {
    const values = await tagForm.validateFields();
    if (editingTag) {
      await api.updateTag(editingTag.id, values);
      message.success('标签已更新');
    } else {
      await api.createTag({ ...scope, ...values });
      message.success('标签已创建');
    }
    setTagModalOpen(false);
    await fetchDictionaries();
  };

  const deleteTag = (tag: ChartTag) => {
    Modal.confirm({
      title: `删除标签「${tag.name}」？`,
      content: '删除后会从已绑定仪表盘中移除。',
      okButtonProps: { danger: true },
      onOk: async () => {
        await api.deleteTag(tag.id);
        message.success('标签已删除');
        await fetchDictionaries();
        await fetchCharts();
      }
    });
  };

  const runChartAction = async (action: 'copy' | 'publish' | 'archive' | 'delete', chart: ChartAsset) => {
    if (action === 'delete') {
      Modal.confirm({
        title: `删除仪表盘「${chart.name}」？`,
        okButtonProps: { danger: true },
        onOk: async () => {
          await api.deleteChart(chart.id);
          message.success('仪表盘已删除');
          await fetchCharts();
        }
      });
      return;
    }
    if (action === 'copy') {
      await api.copyChart(chart.id);
      message.success('仪表盘已复制');
    }
    if (action === 'publish') {
      await api.publishChart(chart.id);
      message.success('仪表盘已发布');
    }
    if (action === 'archive') {
      await api.archiveChart(chart.id);
      message.success('仪表盘已归档');
    }
    await fetchCharts();
  };

  const columns: ColumnsType<ChartAsset> = [
    {
      title: '仪表盘名称',
      dataIndex: 'name',
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Link to={`/charts/${record.id}/edit`}>{value}</Link>
          <Typography.Text type="secondary">{record.description || '暂无描述'}</Typography.Text>
        </Space>
      )
    },
    {
      title: '首图类型',
      dataIndex: 'type',
      width: 120,
      render: (value: ChartAsset['type']) => chartTypeLabels[value]
    },
    {
      title: '目录',
      dataIndex: ['group', 'name'],
      width: 140,
      render: (_: unknown, record) => record.group?.name ?? '未分组'
    },
    {
      title: '标签',
      dataIndex: 'tags',
      render: (recordTags: ChartTag[]) => (
        <Space size={[4, 4]} wrap>
          {recordTags.map((tag) => (
            <Tag key={tag.id} color={tag.color}>
              {tag.name}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: ChartAsset['status']) => (
        <Tag color={status === 'published' ? 'green' : status === 'archived' ? 'default' : 'blue'}>
          {chartStatusLabels[status]}
        </Tag>
      )
    },
    {
      title: '创建人',
      dataIndex: ['creator', 'displayName'],
      width: 120,
      render: (_: unknown, record) => record.creator?.displayName ?? record.createdBy
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 160,
      render: (value: string) => (
        <Tooltip title={formatDateTime(value)}>
          <span>{formatDateTime(value)}</span>
        </Tooltip>
      )
    },
    {
      title: '操作',
      width: 112,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/charts/${record.id}/edit`)}>
            编辑
          </Button>
          {record.status === 'published' && (
            <Button size="small" onClick={() => navigate(`/dashboards/${record.id}`)}>
              查看
            </Button>
          )}
          <Dropdown
            menu={{
              items: [
                { key: 'copy', label: '复制', icon: <CopyOutlined />, disabled: !canWrite },
                { key: 'publish', label: '发布', disabled: !canWrite },
                { key: 'archive', label: '归档', disabled: !canWrite },
                { type: 'divider' },
                { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, disabled: !canWrite }
              ],
              onClick: ({ key }) => void runChartAction(key as 'copy' | 'publish' | 'archive' | 'delete', record)
            }}
          >
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      )
    }
  ];

  return (
    <div className="charts-page">
      <aside className="asset-tree-panel">
        <Flex justify="space-between" align="center">
          <Typography.Title level={5}>仪表盘目录</Typography.Title>
          <Button size="small" icon={<FolderAddOutlined />} disabled={!canWrite} onClick={() => openGroupModal()} />
        </Flex>
        <Tree
          blockNode
          selectedKeys={query.groupId ? [String(query.groupId)] : []}
          treeData={groupTree.map(toTreeNode)}
          onSelect={(keys) => {
            const id = keys[0] ? Number(keys[0]) : undefined;
            setQuery((current) => ({ ...current, page: 1, groupId: id }));
            filterForm.setFieldValue('groupId', id);
          }}
          titleRender={(node) => {
            const group = groups.find((item) => item.id === Number(node.key));
            return (
              <Flex justify="space-between" align="center" gap={8}>
                <span>{node.title as string}</span>
                {group && canWrite && (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'edit', label: '重命名/移动' },
                        { key: 'delete', label: '删除', danger: true }
                      ],
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation();
                        if (key === 'edit') {
                          openGroupModal(group);
                        } else {
                          deleteGroup(group);
                        }
                      }
                    }}
                  >
                    <Button size="small" type="text" icon={<MoreOutlined />} onClick={(event) => event.stopPropagation()} />
                  </Dropdown>
                )}
              </Flex>
            );
          }}
        />
      </aside>

      <main className="asset-main">
        <Card className="filter-panel">
          <Form<FilterFormValues> form={filterForm} layout="inline" onFinish={handleFilter}>
            <Form.Item name="keyword">
              <Input.Search allowClear placeholder="搜索名称/描述" onSearch={() => filterForm.submit()} />
            </Form.Item>
            <Form.Item name="type">
              <Select allowClear placeholder="首图类型" options={chartTypeOptions} className="filter-control" />
            </Form.Item>
            <Form.Item name="status">
              <Select allowClear placeholder="状态" options={chartStatusOptions} className="filter-control" />
            </Form.Item>
            <Form.Item name="groupId">
              <Select allowClear placeholder="目录" options={groupOptions} className="filter-control" />
            </Form.Item>
            <Form.Item name="tagIds">
              <Select allowClear mode="multiple" placeholder="标签" options={tagOptions} className="filter-control wide" />
            </Form.Item>
            <Form.Item name="createdBy">
              <Select allowClear placeholder="创建人" options={userOptions} className="filter-control" />
            </Form.Item>
            <Form.Item name="updatedRange">
              <RangePicker />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                筛选
              </Button>
              <Button onClick={resetFilter}>重置</Button>
            </Space>
          </Form>
        </Card>

        <div className="asset-toolbar">
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchCharts}>
              刷新
            </Button>
            <Button icon={<TagsOutlined />} onClick={() => openTagModal()} disabled={!canWrite}>
              新建标签
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: tags.map((tag) => ({ key: String(tag.id), label: <Tag color={tag.color}>{tag.name}</Tag> })),
                onClick: ({ key }) => {
                  const tag = tags.find((item) => item.id === Number(key));
                  if (tag) {
                    openTagModal(tag);
                  }
                }
              }}
            >
              <Button>管理标签</Button>
            </Dropdown>
          </Space>
          <Space>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as 'table' | 'card')}
              options={[
                { label: '表格', value: 'table' },
                { label: '卡片', value: 'card' }
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} disabled={!canWrite || !projectId} onClick={() => navigate('/charts/new')}>
              创建仪表盘
            </Button>
          </Space>
        </div>

        {viewMode === 'table' ? (
          <Table<ChartAsset>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={charts}
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total,
              showSizeChanger: true,
              onChange: (page, pageSize) => setQuery((current) => ({ ...current, page, pageSize }))
            }}
          />
        ) : (
          <List
            loading={loading}
            grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 3, xl: 3 }}
            dataSource={charts}
            locale={{ emptyText: <Empty description="暂无仪表盘" /> }}
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total,
              onChange: (page, pageSize) => setQuery((current) => ({ ...current, page, pageSize }))
            }}
            renderItem={(chart) => (
              <List.Item>
                <Card
                  className="chart-card"
                  title={chart.name}
                  extra={<Link to={`/charts/${chart.id}/edit`}>编辑</Link>}
                  actions={[
                    <FileAddOutlined key="copy" onClick={() => canWrite && void runChartAction('copy', chart)} />,
                    <DeleteOutlined key="delete" onClick={() => canWrite && void runChartAction('delete', chart)} />
                  ]}
                >
                  <Space direction="vertical" size={8}>
                    <Typography.Text type="secondary">{chart.description || '暂无描述'}</Typography.Text>
                    <Space wrap>
                      <Tag color="blue">{chartTypeLabels[chart.type]}</Tag>
                      <Tag>{chartStatusLabels[chart.status]}</Tag>
                      <Tag>{chart.group?.name ?? '未分组'}</Tag>
                    </Space>
                    <Space size={[4, 4]} wrap>
                      {chart.tags.map((tag) => (
                        <Tag key={tag.id} color={tag.color}>
                          {tag.name}
                        </Tag>
                      ))}
                    </Space>
                  </Space>
                </Card>
              </List.Item>
            )}
          />
        )}
      </main>

      <Modal
        title={editingGroup ? '编辑目录' : '新建目录'}
        open={groupModalOpen}
        onOk={() => void submitGroup()}
        onCancel={() => setGroupModalOpen(false)}
        destroyOnClose
      >
        <Form<GroupFormValues> form={groupForm} layout="vertical">
          <Form.Item name="name" label="目录名称" rules={[{ required: true, message: '请输入目录名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" label="父级目录">
            <Select allowClear options={groupOptions.filter((item) => item.value !== editingGroup?.id)} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} className="full-width" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingTag ? '编辑标签' : '新建标签'}
        open={tagModalOpen}
        onOk={() => void submitTag()}
        onCancel={() => setTagModalOpen(false)}
        destroyOnClose
        footer={(_, { OkBtn, CancelBtn }) => (
          <Space>
            {editingTag && (
              <Button danger onClick={() => deleteTag(editingTag)}>
                删除
              </Button>
            )}
            <CancelBtn />
            <OkBtn />
          </Space>
        )}
      >
        <Form<TagFormValues> form={tagForm} layout="vertical">
          <Form.Item name="name" label="标签名称" rules={[{ required: true, message: '请输入标签名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="color" label="颜色" rules={[{ required: true, message: '请输入颜色' }]}>
            <Input type="color" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

interface GroupTreeData {
  key: string;
  title: string;
  children: GroupTreeData[];
}

function toTreeNode(group: ReturnType<typeof buildGroupTree>[number]): GroupTreeData {
  return {
    key: String(group.id),
    title: group.name,
    children: group.children.map(toTreeNode)
  };
}
