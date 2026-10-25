# 运行网页版

需要安装符合 package.json 依赖要求的 Node.js 和 npm。

在项目根目录执行：

```sh
npm ci
npm run app
```

然后在浏览器打开 <http://localhost:5173/>。此命令同时启动 Vite 前端和本机后端代理（默认端口 4318）。无需运行 Electron。

运行前端生产构建及预览：

```sh
npm run build
npm run proxy
```

另开一个终端执行 `npm run preview -- --host 127.0.0.1`，打开终端显示的预览地址。`preview` 仅用于本机验证构建结果。

浏览器缓存与桌面客户端的缓存互相独立。已有画布可以通过 WDF 导入新画布；请先在原应用保存 WDF。不要清除浏览器站点数据来排查性能问题，以免丢失尚未保存为 WDF 的缓存。

网页模式仍依赖本机后端处理模型请求、本地 WDF 保存及行动执行。此说明用于本机运行；将前端托管到远程站点不等于部署好完整后端。

验证：`npm test` 与 `npm run build`。保留桌面源码，但本轮不生成桌面安装包。
