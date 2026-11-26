# 构建 Wendaflow

## 环境

- Node.js 22.19+（内置的 Pi 需要这个版本；也满足 Vite 的要求）
- npm

安装依赖并验证：

```bash
npm ci
npm run test:quick-thought
npm run build
```

开发模式：

```bash
npm run app
```

## 部署

`npm run build` 生成 `dist/` 静态文件。公开部署见 [deployment/PUBLIC_WEB.md](../deployment/PUBLIC_WEB.md)，个人云存储见 [deployment/PERSONAL_CLOUD.md](../deployment/PERSONAL_CLOUD.md)。项目只维护网页端，不提供安装包：所有人都从 GitHub 获取源码运行。

## 服务端与管理端

- `notification-server/`：通知服务端。
- `notification-manager/`：服务端管理桌面应用及 PostgreSQL 部署文件。

部署前复制 `.env.example` 并生成新的随机密钥。不要使用示例值，也不要把 `.env` 提交到仓库。
