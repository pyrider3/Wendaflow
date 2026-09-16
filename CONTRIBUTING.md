# 参与贡献

感谢你愿意帮助改进 Wendaflow。

## 开始之前

1. 先搜索现有 Issue，避免重复提交。
2. 较大的功能请先创建 Issue，说明使用场景、交互方案和可能影响。
3. 不要提交 API Key、访问令牌、用户数据、激活码、签名证书或真实服务端密钥。

## 本地开发

```bash
npm install
npm run build
npm run desktop:dev
```

提交前请至少运行：

```bash
npm run audit:i18n
npm run build
```

## Pull Request

- 一个 PR 尽量只解决一个问题。
- 说明修改原因、验证方式和涉及的平台。
- 界面变化请附截图或录屏。
- 新增界面文字时，请同步更新所有语言条目并通过翻译审计。
- 不要提交 `node_modules`、`dist`、安装包、运行数据或本地配置。

提交贡献即表示你同意按本仓库的 GNU AGPL-3.0 协议提供该贡献。

