# 构建 Wendaflow

## 环境

- Node.js 20 或更高版本
- npm
- 对应目标平台的构建环境

安装依赖并验证：

```bash
npm install
npm run build
```

开发模式：

```bash
npm run desktop:dev
```

## Windows

```powershell
npm run dist:win
```

## Linux

```bash
npm run dist:linux
```

## macOS

Apple Silicon：

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist:mac:arm64
```

Intel：

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist:mac:x64
```

未签名的 macOS 构建可能触发 Gatekeeper 提示。公开分发前请自行配置 Apple Developer ID、签名和公证流程。

## 服务端与管理端

- `notification-server/`：通知与授权服务端。
- `notification-manager/`：服务端管理桌面应用及 PostgreSQL 部署文件。

部署前复制 `.env.example` 并生成新的随机密钥。不要使用示例值，也不要把 `.env` 提交到仓库。

