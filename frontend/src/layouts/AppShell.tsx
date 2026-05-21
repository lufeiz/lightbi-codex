import { DatabaseOutlined, LogoutOutlined, PieChartOutlined, RocketOutlined, SaveOutlined, TableOutlined } from '@ant-design/icons';
import { Avatar, Button, Layout, Space, Typography } from 'antd';
import { Link, Outlet, useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import { useEditorToolbarStore } from '@/store/editorToolbarStore';

const { Header, Content } = Layout;

export function AppShell() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const toolbar = useEditorToolbarStore((state) => state.toolbar);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout className="app-shell">
      <Layout>
        <Header className="app-header">
          <Space size={16} className="app-header-left">
            <Link to="/charts" className="brand">
              <PieChartOutlined />
              <span>智能BI</span>
            </Link>
            <Link to="/data-sources" className="header-nav-link">
              <DatabaseOutlined />
              <span>数据源</span>
            </Link>
            <Link to="/datasets" className="header-nav-link">
              <TableOutlined />
              <span>数据集</span>
            </Link>
          </Space>
          <div className="app-header-actions">
            {toolbar?.visible && (
              <Space className="global-editor-actions">
                <Typography.Text type="secondary">{toolbar.statusLabel}</Typography.Text>
                <Button type="primary" icon={<SaveOutlined />} loading={toolbar.saving} disabled={!toolbar.canWrite} onClick={toolbar.onSave}>
                  保存
                </Button>
                <Button icon={<RocketOutlined />} loading={toolbar.publishing} disabled={!toolbar.canWrite} onClick={toolbar.onPublish}>
                  发布
                </Button>
                <Button type="primary" ghost loading={toolbar.saving} disabled={!toolbar.canWrite} onClick={toolbar.onSaveAndPublish}>
                  保存并发布
                </Button>
              </Space>
            )}
          </div>
          <div className="user-menu">
            <Space className="user-menu-trigger" role="button" tabIndex={0} aria-haspopup="menu" aria-label="用户菜单">
              <Avatar>{user?.displayName?.slice(0, 1) ?? 'U'}</Avatar>
            </Space>
            <div className="user-menu-dropdown" role="menu">
              <button className="user-menu-item" type="button" role="menuitem" onClick={() => void handleLogout()}>
                <LogoutOutlined />
                <span>退出登录</span>
              </button>
            </div>
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
