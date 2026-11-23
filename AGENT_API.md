# Wendaflow Agent 接口（MCP / CLI / HTTP）

外部 AI Agent（Claude Code、Codex、Cursor……）可以直接操控 Wendaflow：新建画布、加节点、从任意节点分岔提问并拿到 AI 回答、多父汇合、模型擂台、AI 绘图、自动整理、导出。**浏览器里打开的画布会实时显示 Agent 的每一步修改**，AI 回答会一个字一个字地流进卡片。

## 1. 启动

```bash
npm run app        # 前端 + 本地服务（4318 端口）
```

本地服务启动后会写一个发现文件，里面是地址和本次的令牌（权限 600，每次启动都会更换令牌）：

| 系统 | 位置 |
| --- | --- |
| Linux / macOS | `~/.config/wendaflow/agent.json`（或 `$XDG_CONFIG_HOME/wendaflow/agent.json`） |
| Windows | `%APPDATA%\wendaflow\agent.json` |

MCP server 和 CLI 会自动读取这个文件，不需要手动复制令牌。

## 2. 在 Claude Code 里配置 MCP

```bash
claude mcp add wendaflow -- node /绝对路径/Wendaflow/scripts/wendaflow-mcp.mjs
```

或者在项目的 `.mcp.json` 里写：

```json
{
  "mcpServers": {
    "wendaflow": {
      "command": "node",
      "args": ["/绝对路径/Wendaflow/scripts/wendaflow-mcp.mjs"]
    }
  }
}
```

Codex（`~/.codex/config.toml`）：

```toml
[mcp_servers.wendaflow]
command = "node"
args = ["/绝对路径/Wendaflow/scripts/wendaflow-mcp.mjs"]
```

Cursor（`~/.cursor/mcp.json`）的写法和上面的 `.mcp.json` 相同。

配置好以后可以直接对 Agent 说：“在 Wendaflow 里新建一张‘路演准备’画布，列出用户痛点，从‘机会’节点分岔问一下怎么验证需求，再画一张从调研到路演的流程图，最后导出 PNG 到 ./pitch.png。”

## 3. MCP 工具

`canvasId` 可以省略，默认用浏览器当前打开的画布。

| 工具 | 作用 |
| --- | --- |
| `status` | 检查 Wendaflow 是否在运行、有几个浏览器标签连着、当前打开的画布、可用模型 |
| `list_models` | 列出 App 里配置的模型连接（只返回名字和模型 ID，不返回密钥） |
| `list_canvases` | 列出已保存的画布 |
| `create_canvas` | 新建画布，默认在浏览器里打开 |
| `open_canvas` | 让浏览器切换到某张画布 |
| `rename_canvas` | 重命名画布 |
| `get_canvas` | 读取整张画布：每个节点的 id、类型、标题、内容、`parentId`、`extraParentIds`、`childIds`、状态，外加一份缩进大纲；`full=true` 时不截断 |
| `get_node` | 读取单个节点的完整内容（包括 AI 回答全文） |
| `add_nodes` | 批量添加想法卡片；每项可以带 `ref`，后面的项可以用这个 ref 当父节点，所以一次调用就能建出一棵树 |
| `update_node` | 修改标题、内容、位置、标签或父节点（成环会被拒绝） |
| `connect_nodes` | 多父汇合：给子节点加一条父线（`remove=true` 删除这条线） |
| `delete_nodes` | 删除节点；子节点默认挂到被删节点的父节点上，`cascade=true` 则删除整棵子树 |
| `ask` | 从一个节点（或用 `parentIds` 指定的多个父节点）分岔提问，AI 回答实时流进新卡片；`models: [...]` 会让多个模型并排回答（模型擂台）；`wait=false` 立即返回 |
| `wait_for_node` / `stop_node` | 等待或停止一个正在生成的回答 |
| `draw` | AI 绘图：描述一张图，模型画出卡片和连线，可以连到已有节点上 |
| `arrange` | 自动整理；浏览器开着这张画布时按真实卡片尺寸排，否则由服务端估算 |
| `export_canvas` | 导出为 `md`、`png`、`svg`、`html`、`wdf`；带 `path` 时写入文件，不带时文本直接返回，PNG 作为图片返回 |

**模型怎么选**：默认用浏览器里当前选中的模型。浏览器会把已配置的模型连接（包括 API 密钥）只在内存里交给本机服务，不写盘，也不会通过接口返回给 Agent。`model` 参数可以填连接名或模型 ID（来自 `list_models`），也可以写 `ollama:<模型名>`。没开浏览器时，按以下顺序找模型：环境变量 `WENDAFLOW_AGENT_MODEL`（JSON，例如 `{"format":"openai-compatible","endpoint":"https://api.deepseek.com/v1","model":"deepseek-chat","apiKey":"…"}`），然后是本机 Ollama（`qwen2.5:7b`）。

AI 回答的上下文和手动提问完全一致（复用 `src/modelGateway.js`）：会包含整条祖先链、所有额外父节点的分支，以及引用的节点。

## 4. CLI

```bash
npm run wendaflow -- status
node scripts/wendaflow.mjs create_canvas --name "路演"
node scripts/wendaflow.mjs add_nodes --nodes '[{"ref":"a","title":"痛点"},{"title":"方案","parentId":"a"}]'
node scripts/wendaflow.mjs ask --parentId agent-xxx --prompt "怎么验证需求？"
node scripts/wendaflow.mjs export_canvas --format png --out pitch.png
node scripts/wendaflow.mjs help
```

参数写成 `--key value`，值会按 JSON 解析（数字、布尔、数组）；id 和文本字段始终保持为字符串。`--json '{…}'` 可以一次传入全部参数。

## 5. HTTP 接口

`POST http://127.0.0.1:4318/agent-api/v1/<方法>`，请求体是 JSON 参数，请求头带 `Authorization: Bearer <令牌>`。方法名和上面的工具一样（`list_models` 对应 `models`）。

```bash
TOKEN=$(node -p "require(require('os').homedir()+'/.config/wendaflow/agent.json').token")
curl -s -X POST http://127.0.0.1:4318/agent-api/v1/get_canvas -H "Authorization: Bearer $TOKEN" -d '{}'
```

## 6. 实时同步：为什么不会互相覆盖

- **一个写入方**：Agent 的每次修改都会变成节点级操作（`upsert` / `delete` / `meta`），由服务端按画布排队、校验（`normalizeWdf`：不能成环，引用必须存在），写入 `data/canvases/<id>.wdf`，再把画布的 `agentRevision` 加 1。
- **推给浏览器**：同一组操作通过 SSE（`/agent-api/browser/events`）推给所有打开的标签页。正在看这张画布的标签页直接把操作合进当前画面；没打开这张画布的标签页只更新它在 IndexedDB 里的副本。流式回答属于“预览”操作，只显示，不进日志，也不写盘。
- **保存时合并**：浏览器保存时会带上它已应用的最新修订号 `agentRev`（存在 localStorage 里）。如果服务端发现这次保存缺了某些 Agent 修改，会用操作日志把它们补回去再写盘；如果日志已经补不全（比如服务端重启过），就返回 409，浏览器从文件重新载入这张画布，不会悄悄丢掉 Agent 的修改。
- **先取浏览器的最新状态**：Agent 读写一张正在浏览器里打开的画布之前，服务端会先让那个标签页立即保存一次，所以用户刚输入的内容也能被 Agent 看到。
- **断线补齐**：SSE 断线重连时，按 `Last-Event-ID` 补发错过的修改；新打开的标签页会对比各画布的修订号，自动补上关浏览器期间 Agent 做的修改。
- 撤销历史不记录 Agent 的修改，这和后台任务的处理方式一样。卡片上的“停止”按钮也能停止 Agent 发起的回答。

## 7. 安全

- 只监听 `127.0.0.1`。
- `/agent-api/v1/*` 必须带本地令牌（用常量时间比较）。带 `Origin` 头的请求一律拒绝，所以网页无法调用，即使它拿到了令牌也一样。
- 浏览器通道 `/agent-api/browser/*` 只接受本机来源（`localhost`、`127.0.0.1`、桌面版的 `file://` / `null`）。
- 公开部署模式（`WENDAFLOW_PUBLIC=1`）下完全不加载。本地也可以用 `WENDAFLOW_AGENT_API=0` 关闭。
- 可以用 `WENDAFLOW_AGENT_TOKEN` 固定令牌，用 `WENDAFLOW_AGENT_FILE` 改发现文件的位置。远程或容器场景可以设置 `WENDAFLOW_URL` 加 `WENDAFLOW_AGENT_TOKEN`，客户端就不读发现文件了。

## 8. 代码位置

| 文件 | 内容 |
| --- | --- |
| `src/agent-api/ops.mjs` | 两端共用的节点操作、放置、自动整理、摘要和大纲（纯函数） |
| `src/agent-api/hub.mjs` | 修订号、操作日志、SSE、浏览器命令（保存、打开、整理）、保存合并 |
| `src/agent-api/service.mjs` | 全部 Agent 能力（提问、绘图、导出……） |
| `src/agent-api/ai.mjs` | 模型选择与调用（复用 `modelGateway.js`） |
| `src/agent-api/routes.mjs`、`index.mjs` | HTTP 路由、令牌和发现文件 |
| `src/agent-api/mcp.mjs`、`scripts/wendaflow-mcp.mjs` | MCP server（stdio） |
| `src/agent-api/client.mjs`、`scripts/wendaflow.mjs` | CLI |
| `src/agent-api/useAgentBridge.js` | 浏览器端的实时同步 |

测试：`npm run test:agent-api`（也包含在 `npm test` 里）。
