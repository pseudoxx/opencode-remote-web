# OpenCode Remote Web (`opencode-remote-web`)

<p align="center">
  <b>English</b> | <a href="README_zh.md">简体中文</a>
</p>

<p align="center">
  <b>Responsive browser and mobile remote control for your OpenCode assistant server.</b>
</p>

<p align="center">
  🚀 <b>Live Web App (GitHub Pages):</b> <a href="https://pseudoxx.github.io/opencode-remote-web/"><b>https://pseudoxx.github.io/opencode-remote-web/</b></a>
</p>

---

A remote control for [OpenCode](https://opencode.ai) that runs entirely in the browser. Open the page on your phone, tablet or another computer, scan the QR code from `opencode pair`, and drive your OpenCode sessions: chat, approve commands, answer the agent's questions, switch models, revert turns, review changes and export conversations.

There is no backend. The page is static files; it talks straight to your own OpenCode server, and the pairing token stays in your browser's storage.

---

## 🌟 Features

- **Pairing**: scan the `opencode pair` QR code with the camera (or from a photo), paste a pairing link, or sign in with a password. Several servers can be saved; each is remembered on this device only, or just for the tab.
- **Projects and sessions**: switch between projects, open any folder on the server, search, create, rename, fork and delete sessions.
- **Chat**: live streaming replies with Markdown, collapsible reasoning, and tool cards (shell output, file diffs for edits and writes). Attach images and files (picker, paste, or drag and drop). `!command` runs a shell command, `/` lists the server's commands.
- **Model controls**: pick the agent, model and reasoning effort per session.
- **Unblocking the agent**: permission requests (allow once / always / reject with a note) and the agent's questions appear above the input, with a pointer when another session is waiting on you.
- **Revert**: roll a session back to before any message, including its file changes; undo the revert or discard the reverted messages.
- **Changes**: see which files a turn changed ("2 files changed") or the whole session's diff.
- **Copy and export**: copy a message or the whole conversation as Markdown, download Markdown or JSON, or use the share sheet on phones.
- **Connection health**: live status with latency, a heartbeat watchdog that reconnects dead streams (common when a phone sleeps or switches networks), and a connection test.
- **Works everywhere**: phone, tablet and desktop layouts; installable as an app (PWA); light and dark themes.
- **OpenCode 2.x and 1.x**: the desktop app and `@opencode/cli` 2.x, plus `opencode-ai` 1.x servers.

---

## 🚀 Setup & Getting Started

### 1. Open or Host the Web App

- **Direct Live Access**: Open the pre-deployed GitHub Pages site:  
  👉 **[https://pseudoxx.github.io/opencode-remote-web/](https://pseudoxx.github.io/opencode-remote-web/)**
- **Self-Hosting**: Any static host works. The repository includes an automated GitHub Pages deployment workflow ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)). You can also run `npm run build` and deploy the `dist/` directory anywhere (e.g. Cloudflare Pages, Netlify, Vercel, or a local web server).

### 2. Allow the App's Origin on your Computer (CORS)

Browsers only let a page talk to your OpenCode server if the server allows the page's origin (CORS). The app shows the exact command with your origin filled in.

#### With the `opencode` CLI:
```sh
opencode service set cors https://pseudoxx.github.io
opencode service restart
```

#### With the OpenCode Desktop App:
The desktop app runs the same background service and ships the CLI inside the app, so you don't need to install anything separately.

- **macOS** (Terminal), or use app menu **OpenCode → Install CLI…** and then the CLI commands above:
  ```sh
  "/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://pseudoxx.github.io
  "/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
  ```
- **Windows** (PowerShell):
  ```powershell
  & "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://pseudoxx.github.io"
  & "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
  ```
- **Linux** (.deb / .rpm app; for AppImage use the CLI):
  ```sh
  /opt/OpenCode/resources/opencode-cli service set cors https://pseudoxx.github.io
  /opt/OpenCode/resources/opencode-cli service restart
  ```

> [!NOTE]
> The origin is only the scheme and host: `https://pseudoxx.github.io`, without the repository path. If you run a standalone server instead, pass `--cors https://pseudoxx.github.io` to `opencode serve`.

### 3. Pair your Device

#### Over the Internet (easiest):
```sh
opencode pair --remote
```
In the desktop app, use **Pairing → Pair device** and turn on **Remote access** instead. Scan the QR code in the app, or paste the printed connection link.

#### Over Local Network / Tailscale:
- **Tailscale / VPN**: If your host is on your tailnet (e.g. `https://my-mac.tailnet.ts.net`), enter the address directly.
- **LAN IP**: Local IP addresses (e.g. `http://192.168.1.5:49374`) can be accessed if served over plain HTTP, or with local network access permissions in modern browsers.
- **Password**: Switch to the Password tab and enter your server address and password.

### Install as a PWA
- **iOS (Safari)**: Tap Share → **Add to Home Screen**.
- **Android (Chrome)**: Tap menu → **Install app** (or **Add to Home screen**).

---

## 🔒 Security

- **No backend**: Nothing is sent anywhere except your own OpenCode server. Zero analytics, telemetry, or external tracking.
- **Credentials stay local**: The pairing token or password remains in your browser's local storage (or session storage). Pairing links in the URL fragment (`#pair=...`) are stripped immediately from the address bar upon connect.
- **Sanitized output**: Markdown is parsed with [marked](https://marked.js.org) and sanitized with [DOMPurify](https://github.com/cure53/DOMPurify). Remote images and `javascript:` URIs are blocked.
- **Strict Content Security Policy**: Production builds disallow inline and third-party scripts.

---

## 🛠️ Development & Testing

```sh
npm install
npm run dev          # Start local dev server: http://localhost:5173
npm run lab          # Start mock LLM + throwaway OpenCode server (prints a pairing link)
npm run build        # Type-check and build into dist/
npm test             # Run Playwright end-to-end tests
```

### Local Mock Lab Prompts
`dev/mock-llm.mjs` provides an OpenAI-compatible mock server for testing:
- `shell: <command>`: triggers shell tool execution (permission prompt)
- `write: <path>\n<content>`: writes a file (permission prompt, revert, diff viewer)
- `ask: <question>`: asks multiple-choice question
- `think`: streams reasoning blocks, then answer
- `slow`: streams slowly (~20s) for testing Stop/Cancel
- `xss`: replies with malicious HTML to verify DOMPurify

---

## 📄 License

Distributed under the [MIT License](LICENSE).
