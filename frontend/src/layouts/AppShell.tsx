import { LogoutOutlined, PieChartOutlined } from '@ant-design/icons';
import { Avatar, Button, Layout, Space, Typography } from 'antd';
import { Link, Outlet, useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';

const { Header, Content } = Layout;

export function AppShell() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout className="app-shell">
      <Layout>
        <Header className="app-header">
          <Space size={16}>
            <Link to="/charts" className="brand">
              <PieChartOutlined />
              <span>LightBI</span>
            </Link>
            <Typography.Text strong>BI 仪表盘资产管理</Typography.Text>
          </Space>
          <Space>
            <Avatar>{user?.displayName?.slice(0, 1) ?? 'U'}</Avatar>
            <span className="current-user">
              {user?.displayName ?? user?.username}
              <em>{user?.role}</em>
            </span>
            <Button icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
