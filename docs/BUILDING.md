# 构建 Wendaflow

## 环境

- Node.js 20.19+ 或 22.12+（满足当前 Vite 要求）
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

`npm run build` 生成 `dist/` 静态文件。公开部署见 [deployment/PUBLIC_WEB.md](../deployment/PUBLIC_WEB.md)，个人云存储见 [deployment/PERSONAL_CLOUD.md](../deployment/PERSONAL_CLOUD.md)。项目只维护网页端，不再提供桌面安装包。

## 服务端与管理端

- `notification-server/`：通知服务端。
- `notification-manager/`：服务端管理桌面应用及 PostgreSQL 部署文件。

部署前复制 `.env.example` 并生成新的随机密钥。不要使用示例值，也不要把 `.env` 提交到仓库。

## Windows 一键版

打包出 `Wendaflow.exe`（Node 单文件可执行程序）加同目录 `dist/`，双击即启动本机服务并打开浏览器；画布保存在 `%APPDATA%\Wendaflow`。

1. 从 nodejs.org 下载与当前 `node -v` 相同版本的 Windows `node.exe`（`https://nodejs.org/dist/vX.Y.Z/win-x64/node.exe`），并用同目录 `SHASUMS256.txt` 校验。
2. 执行：

```bash
npm run build:windows -- --node-exe /path/to/node.exe
```

输出在 `release/windows/Wendaflow/`，整个文件夹压缩成 zip 即可分发。可用 `WENDAFLOW_WEB_PORT`、`WONDERFUL_PORT` 改端口。

已知限制：exe 未做代码签名，Windows SmartScreen 会提示「未知发布者」；动作模式里 Pi 的审批扩展在单文件包中不可用。
