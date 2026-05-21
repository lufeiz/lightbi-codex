# LightBI

LightBI 是一个首版 BI 图表资产管理系统骨架，包含 React 前端和 Go 后端。

## 功能范围

- 登录、JWT Access Token + Refresh Token、RBAC 三角色：`admin`、`editor`、`viewer`
- 已保存图表列表展示，支持表格/卡片视图
- 多级分组目录和标签管理
- 高级筛选：关键字、图表类型、目录、标签、状态、创建人、更新时间
- 图表配置 CRUD，配置 JSON 落库
- MySQL / PostgreSQL 外部数据源管理、连接测试
- SQL 数据集管理、服务端聚合查询、查询缓存和手动刷新
- 创建/编辑图表页面：左侧图表选择，中间预览画布，右侧配置表单
- AntV G2/S2 渲染图表和表格，X6 提供画布底层能力，F2 作为移动端小图表依赖预留

## 目录结构

```text
backend/   Go + Gin + GORM + MySQL API
frontend/  React 19 + TypeScript + Webpack + Ant Design + AntV
```

## 前端启动

```bash
cd frontend
npm install
npm run dev
```

默认访问 `http://127.0.0.1:3000`。前端开发环境默认使用 `/api` 代理到 `http://localhost:8080`，避免本地 CORS 差异。

## 后端启动

先准备 MySQL 数据库：

```sql
CREATE DATABASE lightbi DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lightbi'@'%' IDENTIFIED BY 'lightbi';
GRANT ALL PRIVILEGES ON lightbi.* TO 'lightbi'@'%';
FLUSH PRIVILEGES;
```

安装 Go 后运行：

```bash
cd backend
cp .env.example .env
go mod tidy
go run ./cmd/server
```

服务默认监听 `:8080`。开启 `RUN_AUTO_MIGRATE=true` 和 `RUN_SEED_DEFAULTS=true` 后，本地首次启动会迁移表结构并创建管理员：

```text
username: admin
password: LightBI@123456
```

本地开发需要在 `.env` 中显式打开迁移和 demo seed：

```env
APP_ENV=development
RUN_AUTO_MIGRATE=true
RUN_SEED_DEFAULTS=true
REGISTER_MODE=invite
REGISTER_CODE=replace-with-register-code
DATA_SOURCE_CREDENTIAL_KEY=replace-with-a-long-data-source-credential-key
```

生产环境会拒绝默认 JWT secret、默认 MySQL DSN、默认 seed 密码、默认数据源加密密钥和自动 seed。新注册用户默认是 `viewer`，需要管理员提升权限。

## 验证命令

```bash
cd frontend
npm run typecheck
npm run build

cd ../backend
go test ./...
```

当前工作站如果没有安装 Go，需要先安装 Go 后再执行后端验证。
