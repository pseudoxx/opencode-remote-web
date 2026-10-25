# OC Remote Web

**English** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [Français](README.fr.md) · [한국어](README.ko.md)

<p align="center">
  🚀 <b>Live Web App (GitHub Pages):</b> <a href="https://pseudoxx.github.io/opencode-remote-web/"><b>https://pseudoxx.github.io/opencode-remote-web/</b></a>
</p>

A remote control for [OpenCode](https://opencode.ai) that runs entirely in the browser. Open the
page on your phone, tablet or another computer, scan the QR code from `opencode pair`, and drive your OpenCode
sessions: chat, approve commands, answer the agent's questions, switch models, revert turns, review changes and
export conversations.

There is no backend. The page is static files; it talks straight to your own OpenCode server, and the pairing
token stays in your browser's storage.

## Features

- **Pairing**: scan the `opencode pair` QR code with the camera (or from a photo), paste a pairing link, or sign
  in with a password. Several servers can be saved; each is remembered on this device only, or just for the tab.
- **Projects and sessions**: switch between projects, open any folder on the server, search, create, rename,
  fork and delete sessions.
- **Chat**: live streaming replies with Markdown, collapsible reasoning, and tool cards (shell output, file diffs
  for edits and writes). Attach images and files (picker, paste, or drag and drop). `!command` runs a shell
  command, `/` lists the server's commands.
- **Model controls**: pick the agent, model and reasoning effort per session.
- **Unblocking the agent**: permission requests (allow once / always / reject with a note) and the agent's
  questions appear above the input, with a pointer when another session is waiting on you.
- **Revert**: roll a session back to before any message, including its file changes; undo the revert or discard
  the reverted messages.
- **Changes**: see which files a turn changed ("2 files changed") or the whole session's diff.
- **Copy and export**: copy a message or the whole conversation as Markdown, download Markdown or JSON, or use
  the share sheet on phones.
- **Connection health**: live status with latency, a heartbeat watchdog that reconnects dead streams (common
  when a phone sleeps or switches networks), and a connection test.
- **Works everywhere**: phone, tablet and desktop layouts; installable as an app (PWA); light and dark themes.
- **Your language**: English, 日本語, 简体中文, 繁體中文, Español, Français and 한국어. The app follows your system
  language; change it on the connect screen or in Settings.
- **OpenCode 2.x and 1.x**: the desktop app and `@opencode/cli` 2.x, plus `opencode-ai` 1.x servers.

## Setup

### 1. Host the page (once)

Any static host works. The repository includes a GitHub Pages workflow:

1. Push this repository to GitHub.
2. In the repository settings, go to **Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` builds and publishes the app (`.github/workflows/pages.yml`).

Prefer a host that gives the app **its own origin**. All GitHub Pages project sites of one account share
`https://<user>.github.io`, and with it the browser storage where your pairing token lives, so any other page you
publish there could read it. A custom domain, or Cloudflare Pages / Netlify with their own subdomain, avoids this.
Those two hosts also apply the security headers in `public/_headers`.

You can also run `npm run build` and copy `dist/` anywhere.

### 2. Allow the app's origin on your computer (once)

Browsers only let a page talk to your OpenCode server if the server allows the page's origin (CORS). The app shows
the exact command with your origin filled in. For the desktop app or `@opencode/cli` 2.x (the background service):

```sh
opencode service set cors https://your-app.example
opencode service restart
```

**Only using the OpenCode desktop app?** It runs the same background service and ships the CLI inside the app, so
you don't need to install anything. The app's error message and setup guide show these with your origin filled in,
for the OS it detects (or picks: macOS / Windows / Linux).

macOS (Terminal), or use the app menu **OpenCode → Install CLI…** and then the commands above:

```sh
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://your-app.example
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
```

Windows (PowerShell):

```powershell
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://your-app.example"
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
```

Linux (.deb / .rpm app; for the AppImage use the CLI):

```sh
/opt/OpenCode/resources/opencode-cli service set cors https://your-app.example
/opt/OpenCode/resources/opencode-cli service restart
```

The origin is only the scheme and host: `https://you.github.io`, not `https://you.github.io/oc-remote-web/`.
Restarting the service stops running agents, so do it while nothing is working. The setting is stored in
`~/.config/opencode/service.json` (`%USERPROFILE%\.config\opencode\service.json` on Windows).

Before the first connection, the app can only guess which OS runs OpenCode, because the browser hides the server's
responses until CORS allows them. It guesses from the server's port (28894 is the Windows default, 49374 the
macOS/Linux default), your last choice, or the device you're browsing on. After connecting once, it reads the OS
from the server's paths and remembers it.

If you already allow other origins, list them all, separated by commas. If you run a standalone server instead,
use `opencode serve --cors https://your-app.example`. For 1.x, use `opencode serve --cors https://your-app.example`
with `OPENCODE_SERVER_PASSWORD` set.

### 3. Pair a device

```sh
opencode pair --remote
```

In the desktop app, use **Pairing → Pair device** and turn on **Remote access** instead. Scan the QR code in the app,
or paste the printed (or copied) link. `--remote` gives an HTTPS address through OpenCode's
tunnel that works from anywhere. Pairing links work once and expire after 5 minutes; the device then stays signed
in for 30 days. To sign every device out, change the server password (`opencode service set password ...`).

Other ways to reach your server:

- **Tailscale or a Cloudflare Tunnel**: put an HTTPS address in front of the server and run
  `opencode pair --url https://your-address`.
- **Same Wi-Fi**: run `opencode service set hostname 0.0.0.0`, then `opencode pair`. The QR code then contains
  plain `http://` LAN addresses. Browsers block those from an `https://` page ("mixed content"). Recent Chrome
  versions may allow them after asking for local network access (the app requests it, but this path is untested);
  otherwise serve the app over plain HTTP on your LAN, or use one of the HTTPS options above.
- **Password**: on the Password tab, enter the server address and password (1.x servers, or `opencode serve`
  with `OPENCODE_SERVER_PASSWORD`).

### Install it as an app

- **iPhone/iPad**: in Safari, tap Share, then Add to Home Screen. The installed app has its own storage, so pair
  once more inside it.
- **Android**: in Chrome, open the menu and choose Install app (or Add to Home screen).

## Security

The page can approve shell commands on your machine, so it is built defensively:

- **No backend.** Nothing is sent anywhere except your own server. There are no analytics and no third-party
  requests.
- **Credentials stay local.** The pairing token, or the password if you use one, is kept in this browser's
  storage, or in session storage only if you untick "Remember on this device". A pairing link in the URL fragment
  (`#pair=...`) is never sent to the web host and is removed from the address bar immediately.
- **Untrusted output is sanitized.** Model output can quote files and web pages the agent read, so Markdown is
  rendered with [marked](https://marked.js.org) and cleaned with [DOMPurify](https://github.com/cure53/DOMPurify).
  Remote images are blocked, and so are `javascript:` links.
- **Strict Content Security Policy.** Production builds allow no inline or third-party scripts and no remote
  images.
- **No framing.** The app refuses to run inside a frame, so it can't be used for clickjacking.

## Browser support

The app targets Chrome/Edge 111+, Firefox 115+ and Safari 16+ (iOS 16+). Small polyfills cover the newer APIs the
OpenCode client uses. The end-to-end suite exercises the features against real OpenCode servers in Chromium,
Firefox and WebKit, at desktop, iPhone, iPad and Android sizes (device emulation, not physical devices).

## Limitations

- No notifications while the page is closed or the phone is locked. Web push would need a server to send pushes.
  While the tab is open in the background, the tab title shows a badge, and desktop notifications can be enabled
  in Settings.
- Not included yet: the terminal (PTY), MCP and provider management, and browsing subagent sessions.

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm run lab          # mock LLM + throwaway OpenCode server; prints a pairing link for the dev server
npm run build        # type-check and build into dist/
npm test             # end-to-end tests (see below)
```

`npm run lab` and the tests use `dev/mock-llm.mjs`, an OpenAI-compatible mock model, so no API key is needed.
These prompts trigger behaviors:

| Prompt | What the mock does |
| --- | --- |
| `shell: <command>` | calls the shell tool (permission prompt) |
| `write: <path>` + newline + content | writes a file (permission prompt, revert, Changes) |
| `ask: <question>` | asks a multiple-choice question |
| `think` | streams reasoning, then an answer |
| `slow` | streams for ~20 s (to test Stop) |
| `xss` | replies with hostile HTML (to test the sanitizer) |

### Tests

The Playwright suite starts its own lab: the mock LLM plus a real OpenCode 2.x server, with throwaway data
directories and git projects. Your own OpenCode setup is never touched.

```sh
npx playwright install --with-deps chromium firefox webkit
OPENCODE_BIN=/path/to/opencode-2.x npm test                                # needs @opencode/cli 2.x
OPENCODE_V1_BIN=/path/to/opencode-1.x OPENCODE_BIN=... npm test            # also runs the 1.x suite
npx playwright test --project=iphone                                       # one device
```

Projects: `unit` (parsing and export logic, no browser), `desktop-chrome`, `desktop-firefox`, `desktop-safari`,
`iphone`, `ipad`, `android`. QR pairing is tested from a photo in every browser, and through a real (fake-device)
camera stream in Chromium.

### Translations

UI text lives in `src/i18n/locales/`, one file per language. `en.ts` defines the keys; every other catalog is
type-checked against it, and a unit test checks that each translation keeps the `{placeholders}`. To add a
language, copy `en.ts`, translate it, and register it in `src/i18n/index.ts`. Labels the OpenCode desktop app only
shows in English (**Pairing**, **Pair device**, **Remote access**) stay in English so they match what you see.

### Layout

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

## License

MIT
