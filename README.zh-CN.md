# OC Remote Web

[English](README.md) · [日本語](README.ja.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [Français](README.fr.md) · [한국어](README.ko.md)

<p align="center">
  🚀 <b>在线体验 / 网页端 (GitHub Pages):</b> <a href="https://pseudoxx.github.io/opencode-remote-web/"><b>https://pseudoxx.github.io/opencode-remote-web/</b></a>
</p>

一个完全在浏览器中运行的 [OpenCode](https://opencode.ai) 遥控器。在手机、平板或另一台电脑上打开页面，扫描
`opencode pair` 的二维码，就能操作你的 OpenCode 会话：聊天、批准命令、回答智能体的问题、切换模型、回退轮次、
查看更改、导出对话。

没有后端。页面只是静态文件，直接与你自己的 OpenCode 服务器通信，配对令牌只保存在你的浏览器存储中。

## 功能

- **配对**：用摄像头（或照片）扫描 `opencode pair` 的二维码、粘贴配对链接，或用密码登录。可以保存多台服务器，
  每台都可以选择只在此设备上记住，或只在当前标签页中使用。
- **项目和会话**：切换项目、打开服务器上的任意文件夹、搜索，以及新建、重命名、分叉和删除会话。
- **聊天**：支持 Markdown 的实时流式回复、可折叠的思考过程，以及工具卡片（Shell 输出、编辑和写入的文件差异）。
  可附加图片和文件（选择、粘贴或拖放）。`!command` 运行 Shell 命令，`/` 列出服务器的命令。
- **模型控制**：为每个会话选择智能体、模型和推理强度。
- **为智能体解除阻塞**：权限请求（允许一次 / 始终允许 / 附带说明拒绝）和智能体的问题会显示在输入框上方；
  当另一个会话在等你时，也会给出提示。
- **回退**：将会话回退到任意一条消息之前，包括其文件更改；可以撤销回退，也可以丢弃已回退的消息。
- **更改**：查看某一轮更改了哪些文件（“更改了 2 个文件”），或整个会话的差异。
- **复制和导出**：将单条消息或整个对话复制为 Markdown，下载 Markdown 或 JSON，在手机上还可以使用分享面板。
- **连接健康**：带延迟的实时状态、自动重连失效数据流的心跳看门狗（手机休眠或切换网络时很常见），以及连接测试。
- **随处可用**：适配手机、平板和桌面的布局；可作为应用（PWA）安装；支持浅色和深色主题。
- **你的语言**：English、日本語、简体中文、繁體中文、Español、Français 和 한국어。应用会跟随系统语言，
  也可以在连接页面或“设置”中更改。
- **OpenCode 2.x 和 1.x**：支持桌面应用和 `@opencode/cli` 2.x，以及 `opencode-ai` 1.x 服务器。

## 设置

### 1. 托管页面（只需一次）

任何静态托管都可以。仓库中已包含 GitHub Pages 工作流：

1. 将此仓库推送到 GitHub。
2. 在仓库设置中打开 **Pages**，将 **Source** 设为 **GitHub Actions**。
3. 每次推送到 `main` 都会构建并发布应用（`.github/workflows/pages.yml`）。

建议选择能为应用提供**独立源**（origin）的托管。同一账号下的所有 GitHub Pages 项目站点共用
`https://<user>.github.io`，也就共用存放配对令牌的浏览器存储，因此你在那里发布的其他页面都能读取它。
使用自定义域名，或使用带独立子域名的 Cloudflare Pages / Netlify，可以避免这个问题。这两个托管还会应用
`public/_headers` 中的安全响应头。

你也可以运行 `npm run build`，然后把 `dist/` 复制到任意位置。

### 2. 在电脑上允许应用的源（只需一次）

只有当服务器允许页面的源时，浏览器才会让页面与你的 OpenCode 服务器通信（CORS）。应用会显示已填好你的源的完整命令。
对于桌面应用或 `@opencode/cli` 2.x（后台服务）：

```sh
opencode service set cors https://your-app.example
opencode service restart
```

**只用 OpenCode 桌面应用？** 桌面应用运行的是同一个后台服务，并且应用内自带 CLI，所以无需安装任何东西。
应用的错误提示和设置指南会针对它检测到的系统（或你选择的 macOS / Windows / Linux）显示以下命令，并填好你的源。

macOS（终端），或者先使用应用菜单 **OpenCode → 安装 CLI...**，再运行上面的命令：

```sh
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://your-app.example
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
```

Windows（PowerShell）：

```powershell
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://your-app.example"
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
```

Linux（.deb / .rpm 版应用；AppImage 请使用 CLI）：

```sh
/opt/OpenCode/resources/opencode-cli service set cors https://your-app.example
/opt/OpenCode/resources/opencode-cli service restart
```

源只包含协议和主机：是 `https://you.github.io`，而不是 `https://you.github.io/oc-remote-web/`。
重启服务会停止正在运行的智能体，请在没有任务运行时操作。该设置保存在 `~/.config/opencode/service.json`
（Windows 上为 `%USERPROFILE%\.config\opencode\service.json`）。

在第一次连接之前，浏览器会在 CORS 允许之前隐藏服务器的响应，所以应用只能猜测 OpenCode 运行在哪个系统上。
它会根据服务器端口（28894 是 Windows 的默认端口，49374 是 macOS/Linux 的默认端口）、你上次的选择，
或你正在使用的设备来推测。连接过一次之后，它会从服务器的路径中读出系统并记住。

如果你已经允许了其他源，请把它们全部列出，用逗号分隔。如果你运行的是独立服务器，请使用
`opencode serve --cors https://your-app.example`。对于 1.x，请在设置 `OPENCODE_SERVER_PASSWORD` 的情况下使用
`opencode serve --cors https://your-app.example`。

### 3. 配对设备

```sh
opencode pair --remote
```

在桌面应用中，改用 **Pairing → Pair device** 并打开 **Remote access**。在应用中扫描二维码，或粘贴打印出的（或复制的）链接。
`--remote` 会通过 OpenCode 的隧道提供一个 HTTPS 地址，在任何地方都能访问。配对链接只能使用一次，5 分钟后过期；
之后设备会保持登录 30 天。要让所有设备退出登录，请更改服务器密码（`opencode service set password ...`）。

访问服务器的其他方式：

- **Tailscale 或 Cloudflare Tunnel**：在服务器前面放一个 HTTPS 地址，然后运行
  `opencode pair --url https://your-address`。
- **同一 Wi-Fi**：运行 `opencode service set hostname 0.0.0.0`，然后运行 `opencode pair`。这时二维码中是未加密的
  `http://` 局域网地址。浏览器会阻止 `https://` 页面访问这些地址（“混合内容”）。较新的 Chrome 在请求本地网络访问权限后
  可能会允许（应用会发出该请求，但这条路径尚未经过测试）；否则请在局域网内通过 HTTP 提供应用，或使用上面的 HTTPS 方式。
- **密码**：在“密码”标签页中输入服务器地址和密码（1.x 服务器，或设置了 `OPENCODE_SERVER_PASSWORD` 的 `opencode serve`）。

### 安装为应用

- **iPhone/iPad**：在 Safari 中点按“共享”，然后选择“添加到主屏幕”。安装后的应用有独立的存储，所以需要在其中再配对一次。
- **Android**：在 Chrome 中打开菜单，选择“安装应用”（或“添加到主屏幕”）。

## 安全

这个页面可以批准在你电脑上运行的 Shell 命令，所以采用了防御性设计：

- **没有后端。** 除了你自己的服务器，不会向任何地方发送数据。没有统计分析，也没有第三方请求。
- **凭据只保存在本地。** 配对令牌（或你使用的密码）保存在此浏览器的存储中；如果取消勾选“在此设备上记住”，则只保存在会话存储中。
  URL 片段中的配对链接（`#pair=...`）永远不会发送给网页托管方，并会立即从地址栏中移除。
- **不可信的输出会被清理。** 模型输出可能引用智能体读取过的文件和网页，因此 Markdown 由 [marked](https://marked.js.org)
  渲染，并由 [DOMPurify](https://github.com/cure53/DOMPurify) 清理。远程图片和 `javascript:` 链接都会被阻止。
- **严格的内容安全策略。** 生产构建不允许内联脚本、第三方脚本和远程图片。
- **禁止嵌入框架。** 应用拒绝在框架中运行，因此无法被用于点击劫持。

## 浏览器支持

应用面向 Chrome/Edge 111+、Firefox 115+ 和 Safari 16+（iOS 16+）。OpenCode 客户端用到的较新 API 由小型 polyfill 补齐。
端到端测试会针对真实的 OpenCode 服务器，在 Chromium、Firefox 和 WebKit 中，以桌面、iPhone、iPad 和 Android 的尺寸
（设备模拟，而非实体设备）验证各项功能。

## 限制

- 页面关闭或手机锁屏时不会收到通知。Web 推送需要一个发送推送的服务器。标签页在后台打开时，标签页标题会显示标记，
  还可以在“设置”中启用桌面通知。
- 尚未包含：终端（PTY）、MCP 和提供商管理，以及浏览子智能体的会话。

## 开发

```sh
npm install
npm run dev          # http://localhost:5173
npm run lab          # mock LLM + throwaway OpenCode server; prints a pairing link for the dev server
npm run build        # type-check and build into dist/
npm test             # end-to-end tests (see below)
```

`npm run lab` 和测试使用 `dev/mock-llm.mjs`，这是一个兼容 OpenAI 的模拟模型，因此不需要 API 密钥。
以下提示词会触发特定行为：

| 提示词 | 模拟模型的行为 |
| --- | --- |
| `shell: <command>` | 调用 Shell 工具（权限请求） |
| `write: <path>` + 换行 + 内容 | 写入文件（权限请求、回退、更改） |
| `ask: <question>` | 提出一个选择题 |
| `think` | 先流式输出思考过程，再给出回答 |
| `slow` | 流式输出约 20 秒（用于测试停止） |
| `xss` | 回复恶意 HTML（用于测试清理器） |

### 测试

Playwright 测试套件会启动自己的实验环境：模拟 LLM 加上一个真实的 OpenCode 2.x 服务器，使用一次性的数据目录和 git 项目。
你自己的 OpenCode 环境不会受到任何影响。

```sh
npx playwright install --with-deps chromium firefox webkit
OPENCODE_BIN=/path/to/opencode-2.x npm test                                # needs @opencode/cli 2.x
OPENCODE_V1_BIN=/path/to/opencode-1.x OPENCODE_BIN=... npm test            # also runs the 1.x suite
npx playwright test --project=iphone                                       # one device
```

测试项目：`unit`（解析和导出逻辑，无需浏览器）、`desktop-chrome`、`desktop-firefox`、`desktop-safari`、`iphone`、`ipad`、
`android`。二维码配对在所有浏览器中都通过照片测试，在 Chromium 中还通过真实的（虚拟设备）摄像头视频流测试。

### 翻译

界面文字位于 `src/i18n/locales/`，每种语言一个文件。`en.ts` 定义所有键，其他语言的词条都会以它为准进行类型检查，
另有单元测试确认每条翻译都保留了 `{placeholders}`。要添加一种语言，复制 `en.ts` 并翻译，然后在 `src/i18n/index.ts` 中注册。
OpenCode 桌面应用只以英文显示的标签（**Pairing**、**Pair device**、**Remote access**）保留英文，以便与你在界面上看到的一致。

### 目录结构

```
src/
  lib/types.ts        normalized data model and the Backend interface
  lib/v2.ts           OpenCode 2.x adapter (official @opencode/client)
  lib/v1.ts           OpenCode 1.x adapter
  lib/connect.ts      transport, server detection, pairing, connection diagnostics
  lib/pairing.ts      parsing QR payloads, links and addresses
  lib/markdown.ts     Markdown rendering and sanitization
  lib/export.ts       Markdown export, clipboard, downloads, share sheet
  state/store.ts      connection lifecycle, heartbeat watchdog, event handling, actions
  i18n/               language detection, translation helpers, one catalog per language
  components/         UI (Preact)
dev/                  mock LLM, lab script, icon renderer, smoke script
tests/                Playwright end-to-end tests and lab setup
```

## 许可证

MIT
