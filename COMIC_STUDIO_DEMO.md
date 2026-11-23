# AI 漫剧工作台（ComfyUI 接入原型）

一句剧情 → 分镜卡片（流式落图）→ 每张卡片调用本机 ComfyUI 出图 → 按顺序导出一张长图漫画。

这是一个**可选插件，默认关闭**。关闭时界面上看不到任何漫剧相关的东西，`server.mjs` 的 `/comfy/*` 接口也直接返回 403。

## 0. 开启插件

1. 打开 **设置 → 插件**，把「AI 漫剧工作台（ComfyUI）」的开关打开。开关保存在当前浏览器（`localStorage` 的 `wendaflow-plugins-v1`），并会同步给本机 `server.mjs`。
2. 打开后会出现三处入口：
   - 输入框多一个 **漫剧** 模式；
   - 设置里多一个 **漫剧** 配置页（插件那一行也有「配置」按钮可以直接跳过去）；
   - 漫剧卡片上出现 **生成画面 / 重新出图 / 逐张出图 / 导出长图** 按钮。
3. 再关掉插件时，已经在画布上的漫剧卡片照常显示，文字和图片都在，只是没有操作按钮。如果当时输入框停在「漫剧」模式，会自动回到「对话」。
4. 公开网页版不提供这个插件，插件列表里会标为不可用。

## 1. 准备 ComfyUI

1. 安装并启动 ComfyUI（默认 `http://127.0.0.1:8188`）：
   ```bash
   python main.py --listen 127.0.0.1 --port 8188
   ```
2. 选一个模板对应的模型：
   - **NoctQ / Qwen Image**（默认，本机已验证）：`models/diffusion_models/NoctQ_V4_int8_convrot.safetensors` + `models/text_encoders/qwen3vl_8b_int8_convrot.safetensors` + `models/vae/qwen_image_2.1_vae_bf16.safetensors`。参数是 25 步、Euler / simple、CFG 3，和用户保存的「NoctQ-V4-5080生图」工作流一致，能直接理解中文提示词。
   - **SDXL**：checkpoint 放在 `models/checkpoints/`，如 `sd_xl_base_1.0.safetensors`。约 25 步，CFG 7。
   - **Flux**：单文件 checkpoint 版，如 `flux1-schnell-fp8.safetensors`。4 步，CFG 1。
3. 不需要给 ComfyUI 配 CORS：浏览器只访问本机 `server.mjs`（4318 端口），再由它转发到 ComfyUI。

## 2. 在 Wendaflow 里配置

`npm run app`（Vite 5173 端口加 `server.mjs` 4318 端口），然后打开 **设置 → 插件** 开启插件，再打开 **设置 → 漫剧**：

| 项 | 说明 |
| --- | --- |
| ComfyUI 地址 | 默认 `http://127.0.0.1:8188` |
| 工作流模板 | NoctQ（默认）/ SDXL / Flux / 自定义（API 格式 JSON） |
| 模型文件 / 文本编码器 / VAE | 点「测试连接」后，下拉框会列出 ComfyUI 里已有的模型（NoctQ 模板会多出文本编码器和 VAE 两项） |
| 统一画风提示词 | 每一格都会加上，用来统一画风，如 `manga comic panel, clean line art, cel shading` |
| 反向提示词 / 宽高 / 步数 / CFG / 分镜数量 | 分镜数量为 4–8，默认 6 |

**自定义工作流**：在 ComfyUI 里用 *Export (API)* 导出 JSON，把正向提示词改成 `{{prompt}}`，粘进设置。还可以使用 `{{negative}}`、`{{seed}}`、`{{checkpoint}}`、`{{width}}`、`{{height}}`、`{{steps}}`、`{{cfg}}`。如果占位符独占一个字段（如 `"seed": "{{seed}}"`），会按数字填入。

## 3. 演示流程（约 1 分钟）

1. 确认插件已开启，输入框切到 **漫剧**，选一个对话模型（云端模型或 Ollama 都可以），输入：
   `一个大学生熬夜写论文，AI 帮他理清思路`
2. 模型边写，画布边出现一张「故事卡」和 6 张分镜卡。每张卡都有画面描述和台词，卡片之间按顺序连线。
3. 在故事卡上点 **逐张出图**：分镜卡依次显示「ComfyUI 排队中 / 正在出图… N 秒」，出完的图作为附件挂到对应卡片上。单张卡片也可以点 **生成画面**，或点 **重新出图** 换一个随机种子。
4. 在故事卡上点 **导出长图**，得到一张 1080 宽的 PNG：顶部是标题，下面是编号分镜和台词气泡，还没出图的格子用文字占位。

**实测（RTX 5080 16GB，NoctQ V4，1216×832，25 步）**：冷启动第一张约 48 秒（含加载模型）；模型加载好后每张约 21–24 秒。4 格「逐张出图」从点击到全部完成约 90 秒；导出的长图为 1080×3416，约 4 MB。

演示建议：开讲前先出一张图，让模型提前加载进显存；现场演示时可以只出 1–2 张，其余提前生成好。同一组分镜默认使用相近的种子，并在每格提示词里带上模型写出的英文角色设定，让角色外观尽量一致。

## 4. 出错时的提示

- ComfyUI 没启动：卡片下方和顶部提示「无法连接 ComfyUI（地址）。请先启动 ComfyUI，或在 设置 → 漫剧 里改地址。」已有的图片和画布都不受影响。
- `server.mjs` 没启动：提示「无法连接本机服务（server.mjs，端口 4318）……」。
- 模型名写错或工作流校验失败：直接显示 ComfyUI 返回的出错节点，如 `CheckpointLoaderSimple: ckpt_name ... not in [...]`。
- 公开网页版会隐藏「漫剧」模式；ComfyUI 相关接口也被 `public-policy` 拦截。

## 5. 代码位置

漫剧的代码都在 `src/plugins/comic/` 里，主程序只通过一个 hook 接入：

- `src/plugins/registry.js`：插件列表、本地开关（`usePlugins`），以及把开关同步给 `server.mjs`
- `src/plugins/server-gate.mjs`：服务端开关，处理 `POST /plugins`；插件未开启时，它的接口返回 403（`code: plugin_disabled`）。如果 `server.mjs` 重启后忘了开关，前端会自动重新同步一次再重试。
- `src/plugins/comic/useComicPlugin.jsx`：`useComicPlugin(app)` 返回输入框模式、提交函数、卡片动作和设置页；插件关闭时这些都不返回
- `src/plugins/comic/ComicCardBar.jsx`、`comic.css`：卡片上的按钮
- `src/plugins/comic/comic.mjs`：分镜提示词、流式解析、卡片布局、NoctQ/SDXL/Flux 工作流模板、`/history` 解析（纯函数）
- `src/plugins/comic/comic-strip.mjs`：长图 SVG（按需懒加载）
- `src/plugins/comic/comfy-proxy.mjs`：ComfyUI 代理（`POST /comfy/status|prompt|progress|image`）
- `src/plugins/comic/i18n.mjs`：9 种语言的文案；测试在 `src/plugins/plugins.test.mjs` 和 `src/plugins/comic/comic.test.mjs`
- 主程序的改动只有：`main.jsx` 调用 `usePlugins()` 和 `useComicPlugin(...)`，再加几处一行的接入；`CardContent.jsx` 在 `view.comicTools` 为真时显示 `ComicCardBar`；`server.mjs` 把请求交给 `createPluginGate`

以后加别的插件：在 `PLUGINS` 里登记一个 id，在 `src/plugins/<id>/` 里写一个返回界面接入点的 hook；如果有服务端接口，就在 `createPluginGate({ ... })` 里挂上它的路由表。
