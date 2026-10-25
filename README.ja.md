# OC Remote Web

[English](README.md) · **日本語** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [Français](README.fr.md) · [한국어](README.ko.md)

ブラウザだけで動く [OpenCode](https://opencode.ai) のリモコンです。スマートフォン、タブレット、別のパソコンでページを開き、
`opencode pair` の QR コードをスキャンすれば、OpenCode のセッションを操作できます。チャット、コマンドの承認、
エージェントからの質問への回答、モデルの切り替え、ターンの巻き戻し、変更の確認、会話のエクスポートに対応しています。

バックエンドはありません。ページは静的ファイルだけで構成され、あなた自身の OpenCode サーバーと直接通信します。
ペアリングトークンはブラウザのストレージにだけ保存されます。

## 機能

- **ペアリング**: `opencode pair` の QR コードをカメラ（または写真）で読み取るか、ペアリングリンクを貼り付けるか、
  パスワードでサインインします。複数のサーバーを保存でき、それぞれこのデバイスだけに記憶するか、このタブの間だけ使うかを選べます。
- **プロジェクトとセッション**: プロジェクトの切り替え、サーバー上の任意のフォルダーを開く、検索、
  セッションの作成・名前変更・フォーク・削除。
- **チャット**: Markdown 対応のストリーミング返信、折りたためる思考過程、ツールカード（シェル出力、編集や書き込みの
  ファイル差分）。画像やファイルの添付（選択、貼り付け、ドラッグ＆ドロップ）。`!command` でシェルコマンドを実行し、
  `/` でサーバーのコマンド一覧を表示します。
- **モデルの操作**: セッションごとにエージェント、モデル、推論の強さを選べます。
- **エージェントの待ちを解消**: 権限リクエスト（今回だけ許可 / 常に許可 / メモ付きで拒否）とエージェントからの質問が
  入力欄の上に表示されます。別のセッションがあなたを待っているときは、その案内も表示されます。
- **巻き戻し**: ファイルの変更も含めて、任意のメッセージの前までセッションを巻き戻せます。巻き戻しの取り消しや、
  巻き戻したメッセージの破棄もできます。
- **変更**: ターンごとに変更されたファイル（「2 個のファイルを変更」）や、セッション全体の差分を確認できます。
- **コピーとエクスポート**: メッセージや会話全体を Markdown としてコピー、Markdown や JSON でダウンロード、
  スマートフォンでは共有シートも使えます。
- **接続の健全性**: 遅延つきのライブ状態表示、切れたストリームを再接続するハートビート監視（スマートフォンがスリープしたり
  ネットワークが切り替わったりするとよく起こります）、接続テスト。
- **どこでも動く**: スマートフォン、タブレット、デスクトップ向けのレイアウト。アプリ（PWA）としてインストール可能。
  ライトテーマとダークテーマ。
- **あなたの言語で**: English、日本語、简体中文、繁體中文、Español、Français、한국어。システムの言語設定に従います。
  接続画面または「設定」で変更できます。
- **OpenCode 2.x と 1.x**: デスクトップアプリと `@opencode/cli` 2.x、さらに `opencode-ai` 1.x のサーバーに対応しています。

## セットアップ

### 1. ページをホストする（初回のみ）

静的ファイルを配信できるホストなら何でも使えます。このリポジトリには GitHub Pages 用のワークフローが含まれています。

1. このリポジトリを GitHub にプッシュします。
2. リポジトリの設定で **Pages** を開き、**Source** を **GitHub Actions** にします。
3. `main` にプッシュするたびにアプリがビルドされ、公開されます（`.github/workflows/pages.yml`）。

アプリに**専用のオリジン**を与えられるホストをおすすめします。同じアカウントの GitHub Pages プロジェクトサイトはすべて
`https://<user>.github.io` を共有しており、ペアリングトークンが保存されるブラウザのストレージも共有されます。
そのため、そこで公開している別のページからトークンを読み取れてしまいます。独自ドメイン、または専用サブドメインを
持つ Cloudflare Pages / Netlify ならこの問題を避けられます。この 2 つのホストでは `public/_headers` の
セキュリティヘッダーも適用されます。

`npm run build` を実行して、`dist/` を好きな場所にコピーすることもできます。

### 2. パソコンでアプリのオリジンを許可する（初回のみ）

ブラウザがページと OpenCode サーバーとの通信を許可するのは、サーバーがそのページのオリジンを許可している場合だけです（CORS）。
アプリはあなたのオリジンを埋め込んだコマンドをそのまま表示します。デスクトップアプリまたは `@opencode/cli` 2.x
（バックグラウンドサービス）の場合:

```sh
opencode service set cors https://your-app.example
opencode service restart
```

**OpenCode デスクトップアプリだけを使っている場合**: デスクトップアプリも同じバックグラウンドサービスで動いていて、
アプリの中に CLI が同梱されているため、何もインストールする必要はありません。アプリのエラーメッセージとセットアップガイドには、
検出した OS（または選択した macOS / Windows / Linux）向けに、あなたのオリジンを埋め込んだ次のコマンドが表示されます。

macOS（ターミナル）。または、アプリのメニュー **OpenCode → CLI をインストール...** を使ってから上のコマンドを実行します。

```sh
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://your-app.example
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
```

Windows（PowerShell）:

```powershell
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://your-app.example"
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
```

Linux（.deb / .rpm 版のアプリ。AppImage の場合は CLI を使ってください）:

```sh
/opt/OpenCode/resources/opencode-cli service set cors https://your-app.example
/opt/OpenCode/resources/opencode-cli service restart
```

オリジンはスキームとホストだけです。`https://you.github.io/oc-remote-web/` ではなく `https://you.github.io` と指定します。
サービスを再起動すると実行中のエージェントが止まるので、何も動いていないときに行ってください。設定は
`~/.config/opencode/service.json`（Windows では `%USERPROFILE%\.config\opencode\service.json`）に保存されます。

初めて接続するまで、ブラウザは CORS が許可されるまでサーバーの応答を隠すため、アプリは OpenCode がどの OS で動いているかを
推測するしかありません。推測には、サーバーのポート（28894 は Windows の既定値、49374 は macOS/Linux の既定値）、前回の選択、
閲覧しているデバイスを使います。一度接続すると、サーバーのパスから OS を読み取って記憶します。

すでに他のオリジンを許可している場合は、すべてをカンマ区切りで並べてください。スタンドアロンのサーバーを使う場合は
`opencode serve --cors https://your-app.example` を使います。1.x では `OPENCODE_SERVER_PASSWORD` を設定したうえで
`opencode serve --cors https://your-app.example` を使います。

### 3. デバイスをペアリングする

```sh
opencode pair --remote
```

デスクトップアプリでは、代わりに **Pairing → Pair device** を使い、**Remote access** をオンにします。アプリで QR コードを
スキャンするか、表示された（またはコピーした）リンクを貼り付けます。`--remote` を付けると、OpenCode のトンネルを経由した
HTTPS アドレスが発行され、どこからでも接続できます。ペアリングリンクは 1 回だけ使え、5 分で期限切れになります。
その後、デバイスは 30 日間サインインしたままになります。すべてのデバイスをサインアウトさせるには、サーバーのパスワードを
変更します（`opencode service set password ...`）。

サーバーに接続するその他の方法:

- **Tailscale または Cloudflare Tunnel**: サーバーの前に HTTPS アドレスを置き、
  `opencode pair --url https://your-address` を実行します。
- **同じ Wi-Fi**: `opencode service set hostname 0.0.0.0` を実行してから `opencode pair` を実行します。この場合、QR コードには
  暗号化されていない `http://` の LAN アドレスが含まれます。ブラウザは `https://` のページからのこうした通信をブロックします
  （「混在コンテンツ」）。最近の Chrome では、ローカルネットワークへのアクセスを確認したうえで許可されることがあります
  （アプリはこの許可を要求しますが、この経路は未検証です）。それ以外の場合は、LAN 内で HTTP のままアプリを配信するか、
  上の HTTPS の方法を使ってください。
- **パスワード**: 「パスワード」タブで、サーバーのアドレスとパスワードを入力します（1.x のサーバー、または
  `OPENCODE_SERVER_PASSWORD` を設定した `opencode serve`）。

### アプリとしてインストールする

- **iPhone/iPad**: Safari で共有ボタンをタップし、「ホーム画面に追加」を選びます。インストールしたアプリは独自のストレージを
  持つので、アプリ内でもう一度ペアリングしてください。
- **Android**: Chrome でメニューを開き、「アプリをインストール」（または「ホーム画面に追加」）を選びます。

## セキュリティ

このページはあなたのマシンでのシェルコマンドを承認できるため、防御的に作られています。

- **バックエンドなし。** あなた自身のサーバー以外には何も送信しません。アクセス解析もサードパーティへのリクエストもありません。
- **認証情報はローカルに。** ペアリングトークン（パスワードを使う場合はパスワード）はこのブラウザのストレージに保存されます。
  「このデバイスに記憶する」のチェックを外すと、セッションストレージにだけ保存されます。URL フラグメントに含まれる
  ペアリングリンク（`#pair=...`）は Web ホストに送られることはなく、すぐにアドレスバーから削除されます。
- **信頼できない出力はサニタイズ。** モデルの出力には、エージェントが読んだファイルや Web ページが引用されることがあるため、
  Markdown は [marked](https://marked.js.org) でレンダリングし、[DOMPurify](https://github.com/cure53/DOMPurify) で
  無害化します。リモート画像と `javascript:` リンクはブロックされます。
- **厳格なコンテンツセキュリティポリシー。** 本番ビルドでは、インラインスクリプト、サードパーティのスクリプト、
  リモート画像を一切許可しません。
- **フレーム内では動作しない。** アプリはフレームの中では動作を拒否するため、クリックジャッキングに悪用できません。

## 対応ブラウザ

対象は Chrome/Edge 111 以降、Firefox 115 以降、Safari 16 以降（iOS 16 以降）です。OpenCode クライアントが使う新しめの API は
小さなポリフィルで補っています。エンドツーエンドテストでは、実際の OpenCode サーバーを相手に、Chromium、Firefox、WebKit で、
デスクトップ、iPhone、iPad、Android のサイズ（実機ではなくデバイスエミュレーション）で各機能を検証しています。

## 制限事項

- ページを閉じているときやスマートフォンがロックされているときは通知されません。Web プッシュには、プッシュを送るサーバーが必要です。
  タブがバックグラウンドで開いている間は、タブのタイトルにバッジが表示され、「設定」でデスクトップ通知を有効にできます。
- 未対応: ターミナル（PTY）、MCP とプロバイダーの管理、サブエージェントのセッションの閲覧。

## 開発

```sh
npm install
npm run dev          # http://localhost:5173
npm run lab          # mock LLM + throwaway OpenCode server; prints a pairing link for the dev server
npm run build        # type-check and build into dist/
npm test             # end-to-end tests (see below)
```

`npm run lab` とテストは、OpenAI 互換のモックモデル `dev/mock-llm.mjs` を使うので、API キーは不要です。
次のプロンプトで特定の動作を起こせます。

| プロンプト | モックの動作 |
| --- | --- |
| `shell: <command>` | シェルツールを呼び出す（権限の確認） |
| `write: <path>` + 改行 + 内容 | ファイルを書き込む（権限の確認、巻き戻し、変更） |
| `ask: <question>` | 選択式の質問をする |
| `think` | 思考過程をストリーミングしてから回答する |
| `slow` | 約 20 秒間ストリーミングする（停止のテスト用） |
| `xss` | 悪意のある HTML で返信する（サニタイザーのテスト用） |

### テスト

Playwright のテストスイートは、モック LLM と実際の OpenCode 2.x サーバーからなる専用のラボを、使い捨てのデータディレクトリと
git プロジェクトで起動します。あなた自身の OpenCode の環境には一切触れません。

```sh
npx playwright install --with-deps chromium firefox webkit
OPENCODE_BIN=/path/to/opencode-2.x npm test                                # needs @opencode/cli 2.x
OPENCODE_V1_BIN=/path/to/opencode-1.x OPENCODE_BIN=... npm test            # also runs the 1.x suite
npx playwright test --project=iphone                                       # one device
```

プロジェクト: `unit`（解析とエクスポートのロジック。ブラウザなし）、`desktop-chrome`、`desktop-firefox`、`desktop-safari`、
`iphone`、`ipad`、`android`。QR ペアリングは、すべてのブラウザで写真から、Chromium では実際の（偽デバイスの）カメラ映像からテストしています。

### 翻訳

UI のテキストは `src/i18n/locales/` に言語ごとに 1 ファイルずつあります。`en.ts` がキーを定義し、他のカタログはすべて
これに対して型チェックされます。さらに、各翻訳が `{placeholders}` を保っているかをユニットテストで確認しています。
言語を追加するには、`en.ts` をコピーして翻訳し、`src/i18n/index.ts` に登録します。OpenCode デスクトップアプリが英語でしか
表示しないラベル（**Pairing**、**Pair device**、**Remote access**）は、画面の表示と一致するよう英語のままにしています。

### 構成

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

## ライセンス

MIT
