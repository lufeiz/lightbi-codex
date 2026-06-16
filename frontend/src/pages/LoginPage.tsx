import { LockOutlined, MailOutlined, MobileOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Radio, Tabs, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import loginBackground from '@/assets/login-background.jpg';
import { useAuthStore } from '@/store/authStore';
import type { LoginPayload, RegisterPayload } from '@/types/domain';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { accessToken, login, register } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (accessToken) {
    return <Navigate to="/dashboards" replace />;
  }

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboards';

  const handleFinish = async (values: LoginPayload) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (values: RegisterPayload) => {
    setSubmitting(true);
    setError(null);
    try {
      await register(values);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page" style={{ backgroundImage: `linear-gradient(90deg, rgba(8, 19, 39, 0.82), rgba(8, 19, 39, 0.42)), url(${loginBackground})` }}>
      <section className="login-hero">
        <div className="login-brand-mark">LightBI</div>
        <Typography.Title level={1}>LightBI</Typography.Title>
        <Typography.Paragraph>
          用统一的数据集、图表配置和资产目录，把分析从临时搭建变成可复用的工作流。
        </Typography.Paragraph>
        <div className="login-metrics">
          <span>40+ Mock 数据集</span>
          <span>RBAC 权限</span>
          <span>可视化编辑器</span>
        </div>
      </section>
      <Card className="login-card">
        {error && <Alert className="form-alert" type="error" showIcon message={error} />}
        <Tabs
          defaultActiveKey="login"
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <>
                  <Typography.Title level={3}>进入工作台</Typography.Title>
                  <Typography.Text type="secondary">使用管理员分配的账号登录。</Typography.Text>
                  <Form<LoginPayload> layout="vertical" onFinish={handleFinish}>
                    <Form.Item name="username" label="账号 / 邮箱 / 手机号" rules={[{ required: true, message: '请输入账号' }]}>
                      <Input prefix={<UserOutlined />} placeholder="账号 / 邮箱 / 手机号" autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={submitting} block>
                      登录
                    </Button>
                  </Form>
                </>
              )
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <>
                  <Typography.Title level={3}>注册分析账号</Typography.Title>
                  <Typography.Text type="secondary">如已开启邀请注册，请输入管理员提供的邀请码。</Typography.Text>
                  <Form<RegisterPayload>
                    layout="vertical"
                    onFinish={handleRegister}
                    initialValues={{ accountType: 'email' }}
                  >
                    <Form.Item name="accountType" label="注册方式" rules={[{ required: true }]}>
                      <Radio.Group optionType="button" buttonStyle="solid">
                        <Radio.Button value="email">
                          <MailOutlined /> 邮箱
                        </Radio.Button>
                        <Radio.Button value="phone">
                          <MobileOutlined /> 手机号
                        </Radio.Button>
                      </Radio.Group>
                    </Form.Item>
                    <Form.Item
                      noStyle
                      shouldUpdate={(prev, next) => prev.accountType !== next.accountType}
                    >
                      {({ getFieldValue }) => {
                        const isEmail = getFieldValue('accountType') === 'email';
                        return (
                          <Form.Item
                            name="account"
                            label={isEmail ? '邮箱' : '手机号'}
                            rules={[
                              { required: true, message: isEmail ? '请输入邮箱' : '请输入手机号' },
                              { type: isEmail ? 'email' : 'string', message: '格式不正确' }
                            ]}
                          >
                            <Input prefix={isEmail ? <MailOutlined /> : <MobileOutlined />} placeholder={isEmail ? 'name@company.com' : '13800000003'} />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>
                    <Form.Item name="displayName" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
                      <Input prefix={<UserOutlined />} placeholder="数据分析师" />
                    </Form.Item>
                    <Form.Item name="code" label="验证码" rules={[{ required: true, message: '请输入验证码' }]}>
                      <Input prefix={<SafetyOutlined />} placeholder="邀请码" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '至少 8 位密码' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="至少 8 位" autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={submitting} block>
                      注册并进入
                    </Button>
                  </Form>
                </>
              )
            }
          ]}
        />
      </Card>
    </main>
  );
}
