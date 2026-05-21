import { ApartmentOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, message, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ProjectMember, ProjectSummary, UserDTO, WorkspaceMember, WorkspaceRole, WorkspaceSummary } from '@/types/domain';

const roleOptions: Array<{ value: WorkspaceRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' }
];

export function WorkspacesPage() {
  const [workspaceForm] = Form.useForm<Pick<WorkspaceSummary, 'name' | 'description'>>();
  const [projectForm] = Form.useForm<Pick<ProjectSummary, 'name' | 'description'> & { ownerId?: number }>();
  const [memberForm] = Form.useForm<{ userId: number; role: WorkspaceRole }>();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [memberModal, setMemberModal] = useState<{ type: 'workspace' | 'project'; id: number } | null>(null);
  const user = useAuthStore((state) => state.user);
  const selectedWorkspaceId = useWorkspaceStore((state) => state.workspaceId);
  const selectedProjectId = useWorkspaceStore((state) => state.projectId);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const setProject = useWorkspaceStore((state) => state.setProject);
  const refreshProjects = useWorkspaceStore((state) => state.refreshProjects);
  const bootstrap = useWorkspaceStore((state) => state.bootstrap);
  const canManage = user?.role === 'admin' || user?.role === 'editor';
  const userOptions = useMemo(() => users.map((item) => ({ value: item.id, label: `${item.displayName} · ${item.username}` })), [users]);

  const load = useCallback(async () => {
    const [workspaceData, projectData, userData] = await Promise.all([api.workspaces(), api.projects(selectedWorkspaceId ?? undefined), api.users().catch(() => [])]);
    setWorkspaces(workspaceData);
    setProjects(projectData);
    setUsers(userData);
    if (selectedWorkspaceId) {
      setWorkspaceMembers(await api.workspaceMembers(selectedWorkspaceId).catch(() => []));
    }
    if (selectedProjectId) {
      setProjectMembers(await api.projectMembers(selectedProjectId).catch(() => []));
    }
  }, [selectedProjectId, selectedWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createWorkspace = async () => {
    const values = await workspaceForm.validateFields();
    const created = await api.createWorkspace(values);
    message.success('工作空间已创建');
    setWorkspaceModalOpen(false);
    await bootstrap();
    await setWorkspace(created.id);
    await load();
  };

  const createProject = async () => {
    if (!selectedWorkspaceId) {
      message.warning('请先选择工作空间');
      return;
    }
    const values = await projectForm.validateFields();
    const created = await api.createProject({ workspaceId: selectedWorkspaceId, name: values.name, description: values.description ?? '', ownerId: values.ownerId });
    message.success('项目已创建');
    setProjectModalOpen(false);
    await refreshProjects(selectedWorkspaceId);
    setProject(created.id);
    await load();
  };

  const upsertMember = async () => {
    if (!memberModal) {
      return;
    }
    const values = await memberForm.validateFields();
    if (memberModal.type === 'workspace') {
      await api.upsertWorkspaceMember(memberModal.id, values);
      message.success('工作空间成员已更新');
    } else {
      await api.upsertProjectMember(memberModal.id, values);
      message.success('项目成员已更新');
    }
    setMemberModal(null);
    await load();
  };

  const workspaceColumns: ColumnsType<WorkspaceSummary> = [
    { title: '工作空间', dataIndex: 'name' },
    { title: '描述', dataIndex: 'description' },
    {
      title: '操作',
      width: 180,
      render: (_, item) => (
        <Space>
          <Button size="small" onClick={() => void setWorkspace(item.id)}>
            切换
          </Button>
          <Button size="small" icon={<TeamOutlined />} disabled={!canManage} onClick={() => setMemberModal({ type: 'workspace', id: item.id })}>
            成员
          </Button>
        </Space>
      )
    }
  ];

  const projectColumns: ColumnsType<ProjectSummary> = [
    { title: '项目', dataIndex: 'name' },
    { title: '描述', dataIndex: 'description' },
    { title: 'Owner', render: (_, item) => item.owner?.displayName ?? item.ownerId },
    {
      title: '操作',
      width: 180,
      render: (_, item) => (
        <Space>
          <Button size="small" onClick={() => setProject(item.id)}>
            切换
          </Button>
          <Button size="small" icon={<TeamOutlined />} disabled={!canManage} onClick={() => setMemberModal({ type: 'project', id: item.id })}>
            成员
          </Button>
        </Space>
      )
    }
  ];

  return (
    <main className="asset-page governance-page">
      <div className="asset-page-header">
        <div>
          <Typography.Title level={3}>工作空间与项目</Typography.Title>
          <Typography.Text type="secondary">维护多空间、多项目和成员权限。</Typography.Text>
        </div>
        <Space>
          <Button icon={<PlusOutlined />} disabled={!canManage} onClick={() => setWorkspaceModalOpen(true)}>
            新建空间
          </Button>
          <Button type="primary" icon={<ApartmentOutlined />} disabled={!canManage || !selectedWorkspaceId} onClick={() => setProjectModalOpen(true)}>
            新建项目
          </Button>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'workspaces',
            label: '工作空间',
            children: <Table rowKey="id" columns={workspaceColumns} dataSource={workspaces} pagination={false} />
          },
          {
            key: 'projects',
            label: '项目',
            children: <Table rowKey="id" columns={projectColumns} dataSource={projects} pagination={false} />
          },
          {
            key: 'members',
            label: '当前成员',
            children: (
              <div className="governance-members">
                <Card title="工作空间成员">
                  <Space wrap>
                    {workspaceMembers.map((member) => (
                      <Tag key={member.id}>{member.user?.displayName ?? member.userId} · {member.role}</Tag>
                    ))}
                  </Space>
                </Card>
                <Card title="项目成员">
                  <Space wrap>
                    {projectMembers.map((member) => (
                      <Tag key={member.id}>{member.user?.displayName ?? member.userId} · {member.role}</Tag>
                    ))}
                  </Space>
                </Card>
              </div>
            )
          }
        ]}
      />

      <Modal title="新建工作空间" open={workspaceModalOpen} onOk={() => void createWorkspace()} onCancel={() => setWorkspaceModalOpen(false)}>
        <Form form={workspaceForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新建项目" open={projectModalOpen} onOk={() => void createProject()} onCancel={() => setProjectModalOpen(false)}>
        <Form form={projectForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="ownerId" label="Owner">
            <Select allowClear showSearch optionFilterProp="label" options={userOptions} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="更新成员" open={Boolean(memberModal)} onOk={() => void upsertMember()} onCancel={() => setMemberModal(null)}>
        <Form form={memberForm} layout="vertical">
          <Form.Item name="userId" label="用户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={userOptions} />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
