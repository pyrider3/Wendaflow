# Wendaflow 应用内通知服务端（Windows）

这个服务只向**正在运行的** Wendaflow 客户端显示应用内通知，客户端退出时 WebSocket 会断开，不会出现系统级弹窗。

但服务器会为每台设备保存最新 200 条通知：如果用户电脑或 Wendaflow 当时没有打开，通知会在他下次打开 Wendaflow、重新连上服务端后同步到右上角通知中心。

## 1. 前提

- 一台 Windows Server 或持续开机的 Windows 服务器
- 已安装 Node.js 20 LTS 或更高版本
- 已安装并运行 Caddy 与 Cloudflare Tunnel（你现有官网的部署方式可复用）
- 一个独立子域名，推荐 `api.qnjyxh.xyz`

## 2. 上传并安装

将 `notification-server` 文件夹上传到服务器，例如：

```powershell
mkdir C:\Wendaflow\notification-server
cd C:\Wendaflow\notification-server
npm install
```

生成一个随机管理密钥，不要发给用户：

```powershell
[guid]::NewGuid().ToString('N')
```

在同一个 PowerShell 窗口设置后启动：

```powershell
$env:WENDAFLOW_ADMIN_TOKEN = "替换为你的随机密钥"
$env:PORT = "8788"
npm start
```

另开一个窗口检查：

```powershell
Invoke-WebRequest http://127.0.0.1:8788/health | Select-Object -Expand Content
```

看到 `{ "ok": true }` 即服务正常。

## 3. 配置 Caddy

在现有 `Caddyfile` 增加：

```caddy
api.qnjyxh.xyz {
  reverse_proxy 127.0.0.1:8788
}
```

重载 Caddy。Cloudflare Tunnel 中新增 Public Hostname：

```text
Hostname: api.qnjyxh.xyz
Service: http://localhost:8788
```

在浏览器打开 `https://api.qnjyxh.xyz/health`；正常会显示 JSON 状态。

## 4. 让服务常驻

建议用 NSSM 把 Node 服务注册为 Windows 服务，避免关闭 PowerShell 后停止。

```powershell
nssm install WendaflowNotifications
```

在窗口中设置：

- Path：`C:\Program Files\nodejs\node.exe`
- Startup directory：`C:\Wendaflow\notification-server`
- Arguments：`server.mjs`
- Environment：`WENDAFLOW_ADMIN_TOKEN=你的随机密钥` 与 `PORT=8788`

保存后：

```powershell
nssm start WendaflowNotifications
```

## 5. 客户端配置与测试

在 Wendaflow：**设置 → 通知 → 通知服务地址**，填写：

```text
https://api.qnjyxh.xyz
```

复制页面显示的“本机设备 ID”。然后在服务器执行：

```powershell
$headers = @{ "x-admin-token" = "你的随机密钥" }
$body = @{
  deviceId = "粘贴软件里的设备 ID"
  title = "测试通知"
  body = "Wendaflow 已成功连接通知服务。"
  kind = "info"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://api.qnjyxh.xyz/v1/notifications" -Headers $headers -ContentType "application/json" -Body $body
```

打开的 Wendaflow 右上角会出现未读角标；点击铃铛即可查看。

## 安全边界

- `WENDAFLOW_ADMIN_TOKEN` 只能保存在服务器端，绝不能写进桌面软件或官网。
- 当前版本使用随机设备 ID 定向投递，适合第一阶段和自用/受控测试。
- 面向公开用户前，应加入账户登录、JWT、设备绑定和限流，避免他人伪造或读取通知。
