# OpenCode Remote Web (`opencode-remote-web`)

<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b>
</p>

<p align="center">
  <b>OpenCode 终端助手 Web / 移动端远程控制面板。</b>
</p>

<p align="center">
  🚀 <b>在线体验 / 网页端 (GitHub Pages):</b> <a href="https://pseudoxx.github.io/opencode-remote-web/"><b>https://pseudoxx.github.io/opencode-remote-web/</b></a>
</p>

---

[OpenCode](https://opencode.ai) 的纯前端远程控制面板。您只需在手机、平板或另一台电脑的浏览器中打开该页面，扫描终端 `opencode pair` 生成的二维码，即可随时随地管理您的 OpenCode 会话：实时聊天、审批命令、回答 Agent 提问、切换模型、步骤回滚、审查代码修改以及导出对话记录。

项目完全无后端服务，纯静态网页运行；直接与您自己的 OpenCode 服务器通信，配对 Token 仅保存在您本地浏览器的存储中。

---

## 🌟 核心功能

- **极速配对**：使用摄像头扫描 `opencode pair` 二维码（或上传二维码截图）、粘贴配对链接，或通过密码直接登录。支持保存多个服务器配置，数据仅保存在当前设备或标签页中。
- **项目与会话管理**：自由切换项目目录，快速打开服务器上的任意文件夹，支持搜索、新建、重命名、分支（Fork）和删除会话。
- **实时对话交互**：Markdown 流式渲染、思维链（Reasoning）折叠展示、工具执行卡片（终端命令输出、文件编辑与新建的 Diff 对比）。支持通过文件选择器、剪贴板粘贴或拖拽上传图片与附件。输入 `!command` 直接执行 Shell 命令，输入 `/` 列出可用服务命令。
- **模型与推理配置**：按会话自由选择 Agent、模型以及推理深度（Reasoning Effort）。
- **实时解除阻塞**：权限审批弹窗（单次允许 / 始终允许 / 附言拒绝）以及 Agent 提出的提问直接呈现在输入框上方；当后台其他会话处于等待状态时会有醒目标记提示。
- **对话回滚与快照**：可随时将整个会话（包括其产生的文件变更）回滚至任意历史消息节点前，并支持随时撤销回滚（Undo Revert）。
- **文件变更审查**：清晰查看单轮对话修改了哪些文件（例如 “2 files changed”），或浏览整个会话的完整 Patch Diff。
- **复制与导出**：一键将单条消息或整场对话导出为干净的 Markdown 格式，支持下载 Markdown 或 JSON 文件，在手机端支持调用系统原生分享面板。
- **连接健康与自动重连**：实时显示连接状态与延迟，内置心跳检测看门狗，当手机休眠或网络切换导致数据流断开时会自动无感重连。
- **全平台多设备适配**：全面适配手机、平板与桌面端视图；支持作为独立应用（PWA）安装至主屏幕；内置浅色与深色模式自适应。
- **OpenCode 2.x & 1.x 全版本兼容**：无缝支持桌面客户端、`@opencode/cli` 2.x 以及老版本 `opencode-ai` 1.x。

---

## 🚀 快速上手与配置

### 1. 访问或托管网页端

- **直接使用在线版本**：直接打开 GitHub Pages 线上地址即可体验：  
  👉 **[https://pseudoxx.github.io/opencode-remote-web/](https://pseudoxx.github.io/opencode-remote-web/)**
- **自建托管**：任何静态网站托管服务均可。仓库内自带 GitHub Actions 自动部署工作流（[`.github/workflows/pages.yml`](.github/workflows/pages.yml)）。您也可以运行 `npm run build`，将生成的 `dist/` 部署到 Cloudflare Pages、Netlify、Vercel 或自己的 Web 服务器上。

### 2. 在您的电脑上允许网页端跨域访问 (CORS)

现代浏览器安全策略要求 OpenCode 服务必须显式允许访问源（CORS）。配对面板也会根据您的设备环境生成对应的配置命令：

#### 使用 `opencode` CLI：
```sh
opencode service set cors https://pseudoxx.github.io
opencode service restart
```

#### 仅使用 OpenCode 桌面端应用：
OpenCode 桌面端内部运行了相同的后台服务并内置了 CLI 工具，无需单独安装全局 CLI：

- **macOS**（在终端中运行，或在应用菜单中点击 **OpenCode → Install CLI…** 后运行上述 CLI 命令）：
  ```sh
  "/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://pseudoxx.github.io
  "/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
  ```
- **Windows**（在 PowerShell 中运行）：
  ```powershell
  & "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://pseudoxx.github.io"
  & "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
  ```
- **Linux**（.deb / .rpm 应用；AppImage 版本请直接使用 CLI）：
  ```sh
  /opt/OpenCode/resources/opencode-cli service set cors https://pseudoxx.github.io
  /opt/OpenCode/resources/opencode-cli service restart
  ```

> [!NOTE]
> Origin 仅包含协议和域名（例如 `https://pseudoxx.github.io`），无需带后面的子路径。如果您运行的是独立服务端命令，可直接在 `opencode serve` 后附加 `--cors https://pseudoxx.github.io` 参数。

### 3. 连接与配对

#### 远程穿透连接（最推荐，随时随地可用）：
```sh
opencode pair --remote
```
在桌面应用中，点击 **Pairing → Pair device** 并打开 **Remote access**。在网页端点击“Scan QR”扫描二维码，或粘贴生成的配对链接。

#### 局域网 / Tailscale 直连：
- **Tailscale / VPN**：如果您的主机开启了 Tailscale（例如 `https://my-mac.tailnet.ts.net`），直接输入该域名。
- **局域网 IP**：通过普通 HTTP 协议可以直接访问本地 IP（如 `http://192.168.1.5:49374`）。
- **密码认证**：切换至“Password”标签页输入主机地址与密码即可连接。

### 安装为 PWA 桌面应用
- **iPhone / iPad (Safari)**：点击分享按钮 → **添加到主屏幕**。
- **Android (Chrome)**：点击菜单 → **安装应用**（或 **添加到主屏幕**）。

---

## 🔒 安全性说明

- **完全无后端**：除直连您的 OpenCode 服务器外，不向任何第三方发送数据，0 遥测、0 外部埋点。
- **本地存储凭证**：配对凭证与密码仅保存在本地浏览器的存储区中。URL Fragment（`#pair=...`）中的一次性配对码在连接后会立即从地址栏抹除。
- **XSS 安全防御**：Markdown 渲染由 [marked](https://marked.js.org) 结合 [DOMPurify](https://github.com/cure53/DOMPurify) 进行严格净化，阻止恶意脚本与跨域图片伪造攻击。
- **严格 CSP 策略**：生产构建启用了严格的 Content-Security-Policy 策略，禁止内联和第三方未知脚本。

---

## 🛠️ 本地开发与测试

```sh
npm install
npm run dev          # 启动本地开发服务: http://localhost:5173
npm run lab          # 启动本地 Mock LLM 与临时 OpenCode 测试环境
npm run build        # 类型检查并编译打包输出至 dist/
npm test             # 运行 Playwright 自动化测试套件
```

### Mock Lab 调试指令
`dev/mock-llm.mjs` 提供了 OpenAI 兼容的本地 Mock 服务，支持以下前缀触发功能测试：
- `shell: <command>`：触发 Shell 命令审批弹窗
- `write: <path>\n<content>`：触发文件写入、回滚与 Diff 审查
- `ask: <question>`：触发 Agent 提问卡片
- `think`：模拟输出思维链推理块
- `slow`：耗时 20 秒缓慢输出（用于测试终止 Stop 机制）
- `xss`：返回恶意 HTML 测试净化拦截效果

---

## 📄 开源协议

本项目采用 [MIT 许可证](LICENSE) 开源。
