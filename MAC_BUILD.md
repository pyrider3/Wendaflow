# Wendaflow 未签名 Mac 版构建

这一版用于测试与小范围分发：不需要 Apple Developer 账号，也不会提交公证。

## 在 Mac 上准备

1. 安装 Node.js 22 LTS。
2. 将整个项目复制到 Mac 本机磁盘（不要在移动硬盘或网络共享目录中构建）。
3. 在项目目录执行：

```bash
npm install
npm run dist:mac
```

## 产物

构建完成后，`dist/` 中会生成两套未签名安装包：

- `Wendaflow-0.1.0-arm64.dmg` / `.zip`：Apple Silicon（M1、M2、M3、M4）Mac。
- `Wendaflow-0.1.0-x64.dmg` / `.zip`：Intel Mac。

如果只需要其中一个架构：

```bash
npm run dist:mac:arm64
# 或
npm run dist:mac:x64
```

## 未签名版本首次打开

用户如果看到开发者验证提示，可在 Finder 中按住 Control 点击 Wendaflow.app，选择“打开”，然后再次确认“打开”。

正式公开发布时，再在同一台 Mac 上配置 Apple Developer ID、签名与公证即可；应用功能和用户本地数据不需要迁移。
