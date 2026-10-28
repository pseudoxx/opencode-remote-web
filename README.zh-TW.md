# OC Remote Web

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [Español](README.es.md) · [Français](README.fr.md) · [한국어](README.ko.md)

<p align="center">
  🚀 <b>線上體驗 / 網頁端 (GitHub Pages):</b> <a href="https://pseudoxx.github.io/opencode-remote-web/"><b>https://pseudoxx.github.io/opencode-remote-web/</b></a>
</p>

一個完全在瀏覽器中執行的 [OpenCode](https://opencode.ai) 遙控器。在手機、平板或另一台電腦上開啟頁面，掃描
`opencode pair` 的 QR 碼，就能操作你的 OpenCode 工作階段：聊天、核准指令、回答代理程式的問題、切換模型、還原回合、
檢視變更、匯出對話。

沒有後端。頁面只是靜態檔案，直接與你自己的 OpenCode 伺服器通訊，配對權杖只儲存在你的瀏覽器儲存空間中。

## 功能

- **配對**：用相機（或照片）掃描 `opencode pair` 的 QR 碼、貼上配對連結，或用密碼登入。可以儲存多台伺服器，
  每台都能選擇只在這部裝置上記住，或只在目前的分頁中使用。
- **專案與工作階段**：切換專案、開啟伺服器上的任何資料夾、搜尋，以及新增、重新命名、建立分支和刪除工作階段。
- **聊天**：支援 Markdown 的即時串流回覆、可摺疊的思考過程，以及工具卡片（Shell 輸出、編輯與寫入的檔案差異）。
  可附加圖片和檔案（選取、貼上或拖放）。`!command` 執行 Shell 指令，`/` 列出伺服器的指令。
- **模型控制**：為每個工作階段選擇代理程式、模型和推理強度。
- **為代理程式解除阻塞**：權限請求（允許一次 / 一律允許 / 附上說明拒絕）和代理程式的問題會顯示在輸入框上方；
  當另一個工作階段在等你時，也會提示你。
- **還原**：將工作階段還原到任何一則訊息之前，包括其檔案變更；可以復原還原，也可以捨棄已還原的訊息。
- **變更**：查看某個回合變更了哪些檔案（「變更了 2 個檔案」），或整個工作階段的差異。
- **複製與匯出**：將單則訊息或整段對話複製為 Markdown，下載 Markdown 或 JSON，在手機上還可以使用分享選單。
- **連線健康狀態**：附延遲的即時狀態、自動重新連線中斷串流的心跳監控（手機休眠或切換網路時很常見），以及連線測試。
- **到處都能用**：適用於手機、平板和桌機的版面配置；可安裝為應用程式（PWA）；支援淺色和深色主題。
- **你的語言**：English、日本語、简体中文、繁體中文、Español、Français 和 한국어。應用程式會依照系統語言顯示，
  也可以在連線畫面或「設定」中變更。
- **OpenCode 2.x 和 1.x**：支援桌面應用程式和 `@opencode/cli` 2.x，以及 `opencode-ai` 1.x 伺服器。

## 設定

### 1. 架設頁面（只需一次）

任何靜態網站代管服務都可以。存放庫中已包含 GitHub Pages 工作流程：

1. 將這個存放庫推送到 GitHub。
2. 在存放庫設定中開啟 **Pages**，將 **Source** 設為 **GitHub Actions**。
3. 每次推送到 `main` 都會建置並發布應用程式（`.github/workflows/pages.yml`）。

建議選擇能讓應用程式**擁有獨立來源**（origin）的代管服務。同一個帳號底下的所有 GitHub Pages 專案網站都共用
`https://<user>.github.io`，也就共用存放配對權杖的瀏覽器儲存空間，因此你在那裡發布的其他頁面都能讀取它。
使用自訂網域，或使用有獨立子網域的 Cloudflare Pages / Netlify，就能避免這個問題。這兩個代管服務也會套用
`public/_headers` 中的安全性標頭。

你也可以執行 `npm run build`，再把 `dist/` 複製到任何地方。

### 2. 在電腦上允許應用程式的來源（只需一次）

只有在伺服器允許頁面的來源時，瀏覽器才會讓頁面與你的 OpenCode 伺服器通訊（CORS）。應用程式會顯示已填入你的來源的完整指令。
對於桌面應用程式或 `@opencode/cli` 2.x（背景服務）：

```sh
opencode service set cors https://your-app.example
opencode service restart
```

**只使用 OpenCode 桌面應用程式？** 桌面應用程式執行的是同一個背景服務，而且應用程式內建 CLI，所以不必安裝任何東西。
應用程式的錯誤訊息和設定指南會針對它偵測到的作業系統（或你選擇的 macOS / Windows / Linux）顯示以下指令，並填入你的來源。

macOS（終端機），或先使用應用程式選單 **OpenCode → 安裝 CLI...**，再執行上面的指令：

```sh
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://your-app.example
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
```

Windows（PowerShell）：

```powershell
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://your-app.example"
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
```

Linux（.deb / .rpm 版應用程式；AppImage 請使用 CLI）：

```sh
/opt/OpenCode/resources/opencode-cli service set cors https://your-app.example
/opt/OpenCode/resources/opencode-cli service restart
```

來源只包含通訊協定和主機：是 `https://you.github.io`，而不是 `https://you.github.io/oc-remote-web/`。
重新啟動服務會停止正在執行的代理程式，請在沒有工作執行時操作。這項設定儲存在 `~/.config/opencode/service.json`
（Windows 上為 `%USERPROFILE%\.config\opencode\service.json`）。

在第一次連線之前，瀏覽器會在 CORS 允許之前隱藏伺服器的回應，所以應用程式只能猜測 OpenCode 在哪個作業系統上執行。
它會根據伺服器的連接埠（28894 是 Windows 的預設值，49374 是 macOS/Linux 的預設值）、你上次的選擇，
或你正在使用的裝置來推測。連線過一次之後，它會從伺服器的路徑讀出作業系統並記住。

如果你已經允許了其他來源，請把它們全部列出，以逗號分隔。如果你執行的是獨立伺服器，請使用
`opencode serve --cors https://your-app.example`。對於 1.x，請在設定 `OPENCODE_SERVER_PASSWORD` 的情況下使用
`opencode serve --cors https://your-app.example`。

### 3. 配對裝置

```sh
opencode pair --remote
```

在桌面應用程式中，請改用 **Pairing → Pair device** 並開啟 **Remote access**。在應用程式中掃描 QR 碼，或貼上印出的（或複製的）連結。
`--remote` 會透過 OpenCode 的通道提供一個 HTTPS 位址，在任何地方都能連線。配對連結只能使用一次，5 分鐘後失效；
之後裝置會保持登入 30 天。若要讓所有裝置登出，請變更伺服器密碼（`opencode service set password ...`）。

連線到伺服器的其他方式：

- **Tailscale 或 Cloudflare Tunnel**：在伺服器前面放一個 HTTPS 位址，然後執行
  `opencode pair --url https://your-address`。
- **同一個 Wi-Fi**：執行 `opencode service set hostname 0.0.0.0`，再執行 `opencode pair`。這時 QR 碼中是未加密的
  `http://` 區域網路位址。瀏覽器會阻擋 `https://` 頁面存取這些位址（「混合內容」）。較新版本的 Chrome 在要求區域網路
  存取權限後可能會允許（應用程式會提出這項要求，但這條路徑尚未經過測試）；否則請在區域網路內以 HTTP 提供應用程式，
  或使用上面的 HTTPS 方式。
- **密碼**：在「密碼」分頁中輸入伺服器位址和密碼（1.x 伺服器，或設定了 `OPENCODE_SERVER_PASSWORD` 的 `opencode serve`）。

### 安裝為應用程式

- **iPhone/iPad**：在 Safari 中點一下「分享」，然後選擇「加入主畫面」。安裝後的應用程式有獨立的儲存空間，所以需要在其中再配對一次。
- **Android**：在 Chrome 中開啟選單，選擇「安裝應用程式」（或「新增至主畫面」）。

## 安全性

這個頁面可以核准在你電腦上執行的 Shell 指令，所以採用防禦性設計：

- **沒有後端。** 除了你自己的伺服器，不會傳送資料到任何地方。沒有分析追蹤，也沒有第三方請求。
- **憑證只留在本機。** 配對權杖（或你使用的密碼）儲存在這個瀏覽器的儲存空間中；如果取消勾選「在這部裝置上記住」，
  則只儲存在工作階段儲存空間中。URL 片段中的配對連結（`#pair=...`）絕不會傳送給網站代管方，並會立即從網址列中移除。
- **不受信任的輸出會經過清理。** 模型輸出可能引用代理程式讀取過的檔案和網頁，因此 Markdown 由
  [marked](https://marked.js.org) 轉譯，並由 [DOMPurify](https://github.com/cure53/DOMPurify) 清理。
  遠端圖片和 `javascript:` 連結都會被阻擋。
- **嚴格的內容安全政策。** 正式版建置不允許內嵌指令碼、第三方指令碼和遠端圖片。
- **禁止嵌入框架。** 應用程式拒絕在框架中執行，因此無法被用於點擊劫持。

## 瀏覽器支援

應用程式支援 Chrome/Edge 111+、Firefox 115+ 和 Safari 16+（iOS 16+）。OpenCode 用戶端用到的較新 API 由小型 polyfill 補足。
端對端測試會針對真實的 OpenCode 伺服器，在 Chromium、Firefox 和 WebKit 中，以桌機、iPhone、iPad 和 Android 的尺寸
（裝置模擬，而非實體裝置）驗證各項功能。

## 限制

- 頁面關閉或手機鎖定時不會收到通知。Web 推播需要一台負責傳送推播的伺服器。分頁在背景開啟時，分頁標題會顯示標記，
  也可以在「設定」中啟用桌面通知。
- 尚未包含：終端機（PTY）、MCP 和供應商管理，以及瀏覽子代理程式的工作階段。

## 開發

```sh
npm install
npm run dev          # http://localhost:5173
npm run lab          # mock LLM + throwaway OpenCode server; prints a pairing link for the dev server
npm run build        # type-check and build into dist/
npm test             # end-to-end tests (see below)
```

`npm run lab` 和測試使用 `dev/mock-llm.mjs`，這是一個相容 OpenAI 的模擬模型，因此不需要 API 金鑰。
以下提示詞會觸發特定行為：

| 提示詞 | 模擬模型的行為 |
| --- | --- |
| `shell: <command>` | 呼叫 Shell 工具（權限請求） |
| `write: <path>` + 換行 + 內容 | 寫入檔案（權限請求、還原、變更） |
| `ask: <question>` | 提出一個選擇題 |
| `think` | 先串流輸出思考過程，再給出回答 |
| `slow` | 串流輸出約 20 秒（用於測試停止） |
| `xss` | 回覆惡意 HTML（用於測試清理器） |

### 測試

Playwright 測試套件會啟動自己的實驗環境：模擬 LLM 加上一台真實的 OpenCode 2.x 伺服器，使用拋棄式的資料目錄和 git 專案。
你自己的 OpenCode 環境完全不會受到影響。

```sh
npx playwright install --with-deps chromium firefox webkit
OPENCODE_BIN=/path/to/opencode-2.x npm test                                # needs @opencode/cli 2.x
OPENCODE_V1_BIN=/path/to/opencode-1.x OPENCODE_BIN=... npm test            # also runs the 1.x suite
npx playwright test --project=iphone                                       # one device
```

測試專案：`unit`（解析和匯出邏輯，不需要瀏覽器）、`desktop-chrome`、`desktop-firefox`、`desktop-safari`、`iphone`、`ipad`、
`android`。QR 碼配對在所有瀏覽器中都以照片測試，在 Chromium 中還會以真實的（虛擬裝置）相機串流測試。

### 翻譯

介面文字位於 `src/i18n/locales/`，每種語言一個檔案。`en.ts` 定義所有鍵值，其他語言的目錄都會以它為準進行型別檢查，
另有單元測試確認每則翻譯都保留了 `{placeholders}`。若要新增語言，請複製 `en.ts` 並翻譯，再到 `src/i18n/index.ts` 註冊。
OpenCode 桌面應用程式只以英文顯示的標籤（**Pairing**、**Pair device**、**Remote access**）保留英文，以便與你在畫面上看到的一致。

### 目錄結構

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

## 授權

MIT

---

<p align="center">
  <b>友情連結：</b><a href="https://linux.do/">LINUX DO</a>
</p>

