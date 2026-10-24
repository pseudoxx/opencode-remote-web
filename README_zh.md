# OpenCode Remote Web (`opencode-remote-web`)

<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b>
</p>

<p align="center">
  <b>非官方的 OpenCode 终端助手 Web / 移动端远程控制面板。</b>
</p>

---

## 🌟 核心功能

- 📱 **移动端与 PWA 优先**：深度适配手机与桌面端屏幕，支持作为独立 PWA 应用安装到主屏幕，配备离线外壳缓存（Service Worker）。
- ⚡ **极速配对连接**：
  - 📷 **扫码连接**：使用手机摄像头直接扫描 `opencode pair` 生成的终端二维码，或上传二维码截图完成配对。
  - 🔗 **链接配对**：粘贴一次性连接链接（`http://<host>:<port>/auth/connect/<token>`）。
  - 🔑 **密码直连**：支持局域网、Tailscale 或内网穿透（Tunnel）地址，使用账号密码认证。
- 💬 **实时流式会话**：支持 Markdown 实时流式渲染、思维链（Reasoning / Thinking）折叠展示及工具状态标记。
- 🛡️ **交互式权限审批**：敏感操作（终端命令执行、文件修改写入）实时弹出审批卡片；支持直接在手机端选择或回复 Agent 提出的多选/填空问题。
- 🔍 **文件 Diff 与快照回滚**：支持查看单轮修改的 Patch Diff，支持对话步骤回滚（Revert）与撤销回滚（Undo Revert）。
- 📄 **Markdown 会话导出**：一键将完整会话导出为干净的 Markdown 格式，自动处理代码块转义、附件提示与工具调用摘要。
- 🔌 **全版本兼容**：开箱即用支持 OpenCode 2.x 以及 OpenCode 1.x (opencode-ai) 协议服务。

---

## 🚀 快速上手

### 1. 配对连接到您的 OpenCode 服务

1. 在项目目录中启动 OpenCode 服务或配对指令：
   ```bash
   opencode pair
   ```
2. 在浏览器中打开 OC Remote：
   - **扫描二维码**：点击“Scan QR”，用手机摄像头对准终端中的二维码（或上传保存的图片）。
   - **粘贴链接**：粘贴控制台打印的包含配对码的连接链接。
   - **密码登录**：切换至“Password”标签页，输入服务器地址与密码。

---

## 🛠️ 本地开发与测试

仓库内置了无需连接外部真实 LLM Provider 的完整本地沙箱与自动化测试套件：

### 本地模拟沙箱 (Mock Lab)
启动内置的 Mock LLM 服务与 throwaway OpenCode 服务：
```bash
node dev/lab.mjs
```
该命令会自动创建一个临时的 Git 沙箱项目并打印单次使用的配对链接，供开发调试使用。

### 自动化测试
运行基于 Playwright 的完整测试套件：
```bash
npx playwright test
```
- `tests/unit.spec.ts`：纯逻辑单元测试（包括地址格式解析、配对 Token 解码、Markdown 导出等）。
- `tests/app.spec.ts`：端到端（E2E）核心交互测试（配对流、消息流式接收、权限审批弹窗、深色模式等）。
- `tests/qr.spec.ts`：模拟虚拟摄像头与图片解析二维码测试。
- `tests/v1.spec.ts`：OpenCode 1.x 兼容模式测试。

### 冒烟测试与多端截图生成
```bash
node dev/smoke.mjs [输出目录]
node dev/screens.mjs <配对链接> [输出目录]
```

---

## 🌐 部署方式

仓库内置 GitHub Actions 自动化部署工作流（[`.github/workflows/pages.yml`](.github/workflows/pages.yml)），每次推送到 `main` 分支时会自动打包并发布至 GitHub Pages。

---

## 📄 开源协议

本项目采用 [MIT 许可证](LICENSE) 开源。
