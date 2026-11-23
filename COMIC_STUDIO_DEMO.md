# AI 漫剧工作台（ComfyUI 接入原型）

一句剧情 → 分镜卡片（流式落图）→ 每张卡片调用本机 ComfyUI 出图 → 按顺序导出一张长图漫画。

## 1. 准备 ComfyUI

1. 安装并启动 ComfyUI（默认 `http://127.0.0.1:8188`）：
   ```bash
   python main.py --listen 127.0.0.1 --port 8188
   ```
2. 把一个模型放进 `ComfyUI/models/checkpoints/`，二选一：
   - **SDXL**（默认模板）：如 `sd_xl_base_1.0.safetensors`，或动漫风的 `animagine-xl-3.1.safetensors`。约 25 步，CFG 7。
   - **Flux**：单文件 checkpoint 版，如 `flux1-schnell-fp8.safetensors`。4 步，CFG 1，出图最快，适合现场演示。
3. 不需要给 ComfyUI 配 CORS：浏览器只访问本机 `server.mjs`（4318 端口），再由它转发到 ComfyUI。

## 2. 在 Wendaflow 里配置

`npm run app`（Vite 5173 端口加 `server.mjs` 4318 端口），然后打开 **设置 → 漫剧**：

| 项 | 说明 |
| --- | --- |
| ComfyUI 地址 | 默认 `http://127.0.0.1:8188` |
| 工作流模板 | SDXL / Flux / 自定义（API 格式 JSON） |
| 模型文件 | 点「测试连接」后，下拉框会列出 ComfyUI 里已有的 checkpoint |
| 统一画风提示词 | 每一格都会加上，用来统一画风，如 `manga comic panel, clean line art, cel shading` |
| 反向提示词 / 宽高 / 步数 / CFG / 分镜数量 | 分镜数量为 4–8，默认 6 |

**自定义工作流**：在 ComfyUI 里用 *Export (API)* 导出 JSON，把正向提示词改成 `{{prompt}}`，粘进设置。还可以使用 `{{negative}}`、`{{seed}}`、`{{checkpoint}}`、`{{width}}`、`{{height}}`、`{{steps}}`、`{{cfg}}`。如果占位符独占一个字段（如 `"seed": "{{seed}}"`），会按数字填入。

## 3. 演示流程（约 1 分钟）

1. 输入框切到 **漫剧**，选一个对话模型（云端模型或 Ollama 都可以），输入：
   `一个大学生熬夜写论文，AI 帮他理清思路`
2. 模型边写，画布边出现一张「故事卡」和 6 张分镜卡。每张卡都有画面描述和台词，卡片之间按顺序连线。
3. 在故事卡上点 **逐张出图**：分镜卡依次显示「ComfyUI 排队中 / 正在出图… N 秒」，出完的图作为附件挂到对应卡片上。单张卡片也可以点 **生成画面**，或点 **重新出图** 换一个随机种子。
4. 在故事卡上点 **导出长图**，得到一张 1080 宽的 PNG：顶部是标题，下面是编号分镜和台词气泡，还没出图的格子用文字占位。

演示建议：先用 Flux schnell 或较小的 SDXL 提前跑一遍，确认模型已经加载进显存，现场出图会快很多。同一组分镜默认使用相近的种子，并在每格提示词里带上模型写出的英文角色设定，让角色外观尽量一致。

## 4. 出错时的提示

- ComfyUI 没启动：卡片下方和顶部提示「无法连接 ComfyUI（地址）。请先启动 ComfyUI，或在 设置 → 漫剧 里改地址。」已有的图片和画布都不受影响。
- `server.mjs` 没启动：提示「无法连接本机服务（server.mjs，端口 4318）……」。
- 模型名写错或工作流校验失败：直接显示 ComfyUI 返回的出错节点，如 `CheckpointLoaderSimple: ckpt_name ... not in [...]`。
- 公开网页版会隐藏「漫剧」模式；ComfyUI 相关接口也被 `public-policy` 拦截。

## 5. 代码位置

- `src/canvas/comic.mjs`：分镜提示词、流式解析、卡片布局、SDXL/Flux 工作流模板、`/history` 解析（纯函数）
- `src/canvas/comic-strip.mjs`：长图 SVG，按需懒加载，复用 `export.mjs` 的 `wrapText`/`escapeXml`
- `src/canvas/comfy-proxy.mjs`：`server.mjs` 使用的 ComfyUI 代理（`POST /comfy/status|prompt|progress|image`）
- `src/canvas/comic.test.mjs`：9 个测试，包含用假 ComfyUI 跑完整的提交、轮询、取图流程
- `src/main.jsx`：`storyboardWithAI`、`generateComicPanel`、`generateComicSeries`、`exportComicStrip`，以及设置页
- `src/cards/CardContent.jsx`：卡片上的出图和导出按钮；`src/i18n/comic.mjs`：9 种语言的文案
