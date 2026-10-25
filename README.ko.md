# OC Remote Web

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [Français](README.fr.md) · **한국어**

<p align="center">
  🚀 <b>온라인 체험 / 웹 앱 (GitHub Pages):</b> <a href="https://pseudoxx.github.io/opencode-remote-web/"><b>https://pseudoxx.github.io/opencode-remote-web/</b></a>
</p>

브라우저만으로 동작하는 [OpenCode](https://opencode.ai) 리모컨입니다. 휴대폰, 태블릿 또는 다른 컴퓨터에서 페이지를 열고
`opencode pair`의 QR 코드를 스캔하면 OpenCode 세션을 조작할 수 있습니다. 채팅, 명령 승인, 에이전트 질문에 답하기,
모델 전환, 턴 되돌리기, 변경 사항 검토, 대화 내보내기를 지원합니다.

백엔드는 없습니다. 페이지는 정적 파일로만 이루어져 있으며 여러분의 OpenCode 서버와 직접 통신하고, 페어링 토큰은
브라우저 저장소에만 보관됩니다.

## 기능

- **페어링**: `opencode pair`의 QR 코드를 카메라(또는 사진)로 스캔하거나, 페어링 링크를 붙여넣거나, 비밀번호로
  로그인합니다. 여러 서버를 저장할 수 있으며, 각각 이 기기에만 기억하거나 현재 탭에서만 사용할 수 있습니다.
- **프로젝트와 세션**: 프로젝트 전환, 서버의 아무 폴더나 열기, 검색, 세션 만들기·이름 바꾸기·분기·삭제.
- **채팅**: Markdown을 지원하는 실시간 스트리밍 답변, 접을 수 있는 추론 과정, 도구 카드(셸 출력, 편집과 쓰기의 파일
  diff). 이미지와 파일 첨부(선택, 붙여넣기, 드래그 앤 드롭). `!command`로 셸 명령을 실행하고, `/`로 서버의 명령 목록을
  봅니다.
- **모델 제어**: 세션마다 에이전트, 모델, 추론 강도를 고릅니다.
- **에이전트 막힘 풀기**: 권한 요청(한 번 허용 / 항상 허용 / 메모와 함께 거부)과 에이전트의 질문이 입력창 위에 표시되며,
  다른 세션이 여러분을 기다리고 있으면 알려 줍니다.
- **되돌리기**: 파일 변경 사항까지 포함해 세션을 원하는 메시지 이전으로 되돌립니다. 되돌리기를 취소하거나 되돌린 메시지를
  버릴 수도 있습니다.
- **변경 사항**: 한 턴에서 바뀐 파일("파일 2개 변경됨")이나 세션 전체의 diff를 확인합니다.
- **복사와 내보내기**: 메시지 하나 또는 대화 전체를 Markdown으로 복사하고, Markdown이나 JSON으로 다운로드하거나,
  휴대폰에서는 공유 시트를 사용합니다.
- **연결 상태**: 지연 시간이 표시되는 실시간 상태, 끊어진 스트림을 다시 연결하는 하트비트 감시(휴대폰이 잠자기에 들어가거나
  네트워크가 바뀔 때 자주 발생), 연결 테스트.
- **어디서나 동작**: 휴대폰, 태블릿, 데스크톱 레이아웃. 앱(PWA)으로 설치 가능. 라이트 테마와 다크 테마.
- **여러분의 언어로**: English, 日本語, 简体中文, 繁體中文, Español, Français, 한국어. 앱은 시스템 언어를 따르며,
  연결 화면이나 설정에서 바꿀 수 있습니다.
- **OpenCode 2.x와 1.x**: 데스크톱 앱과 `@opencode/cli` 2.x, 그리고 `opencode-ai` 1.x 서버를 지원합니다.

## 설정

### 1. 페이지 호스팅하기(한 번만)

정적 파일을 제공하는 호스트라면 어디든 됩니다. 저장소에는 GitHub Pages 워크플로가 포함되어 있습니다.

1. 이 저장소를 GitHub에 푸시합니다.
2. 저장소 설정에서 **Pages**로 이동해 **Source**를 **GitHub Actions**로 설정합니다.
3. `main`에 푸시할 때마다 앱이 빌드되어 게시됩니다(`.github/workflows/pages.yml`).

앱에 **고유한 출처**(origin)를 주는 호스트를 권장합니다. 한 계정의 GitHub Pages 프로젝트 사이트는 모두
`https://<user>.github.io`를 공유하고, 그와 함께 페어링 토큰이 저장되는 브라우저 저장소도 공유하므로, 그곳에 게시한
다른 페이지가 토큰을 읽을 수 있습니다. 사용자 지정 도메인이나 고유한 하위 도메인을 쓰는 Cloudflare Pages / Netlify를
사용하면 이 문제를 피할 수 있습니다. 이 두 호스트는 `public/_headers`의 보안 헤더도 적용합니다.

`npm run build`를 실행한 뒤 `dist/`를 원하는 곳에 복사해도 됩니다.

### 2. 컴퓨터에서 앱의 출처 허용하기(한 번만)

브라우저는 서버가 페이지의 출처를 허용할 때만 페이지가 OpenCode 서버와 통신하도록 합니다(CORS). 앱은 여러분의 출처가
채워진 정확한 명령을 보여 줍니다. 데스크톱 앱 또는 `@opencode/cli` 2.x(백그라운드 서비스)의 경우:

```sh
opencode service set cors https://your-app.example
opencode service restart
```

**OpenCode 데스크톱 앱만 사용하나요?** 데스크톱 앱도 같은 백그라운드 서비스를 실행하고 앱 안에 CLI가 들어 있으므로
아무것도 설치할 필요가 없습니다. 앱의 오류 메시지와 설정 가이드는 감지한 운영체제(또는 선택한 macOS / Windows / Linux)에
맞춰 여러분의 출처가 채워진 다음 명령을 보여 줍니다.

macOS(터미널). 또는 앱 메뉴에서 **OpenCode → CLI 설치...** 를 사용한 뒤 위의 명령을 실행합니다.

```sh
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://your-app.example
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
```

Windows(PowerShell):

```powershell
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://your-app.example"
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
```

Linux(.deb / .rpm 앱. AppImage는 CLI를 사용하세요):

```sh
/opt/OpenCode/resources/opencode-cli service set cors https://your-app.example
/opt/OpenCode/resources/opencode-cli service restart
```

출처는 스킴과 호스트만 포함합니다. `https://you.github.io/oc-remote-web/`이 아니라 `https://you.github.io`입니다.
서비스를 다시 시작하면 실행 중인 에이전트가 멈추므로, 아무 작업도 없을 때 하세요. 설정은
`~/.config/opencode/service.json`(Windows에서는 `%USERPROFILE%\.config\opencode\service.json`)에 저장됩니다.

처음 연결하기 전에는 CORS가 허용할 때까지 브라우저가 서버의 응답을 숨기기 때문에, 앱은 OpenCode가 어떤 운영체제에서
실행 중인지 추측할 수밖에 없습니다. 서버 포트(28894는 Windows 기본값, 49374는 macOS/Linux 기본값), 마지막 선택,
현재 사용 중인 기기를 바탕으로 추측합니다. 한 번 연결한 뒤에는 서버의 경로에서 운영체제를 읽어 기억합니다.

이미 다른 출처를 허용하고 있다면 모두 쉼표로 구분해 나열하세요. 독립 실행형 서버를 쓴다면
`opencode serve --cors https://your-app.example`를 사용하세요. 1.x에서는 `OPENCODE_SERVER_PASSWORD`를 설정한 상태로
`opencode serve --cors https://your-app.example`를 사용합니다.

### 3. 기기 페어링하기

```sh
opencode pair --remote
```

데스크톱 앱에서는 대신 **Pairing → Pair device**를 사용하고 **Remote access**를 켭니다. 앱에서 QR 코드를 스캔하거나,
출력된(또는 복사한) 링크를 붙여넣으세요. `--remote`를 쓰면 OpenCode 터널을 거치는 HTTPS 주소가 발급되어 어디서나
접속할 수 있습니다. 페어링 링크는 한 번만 쓸 수 있고 5분 후 만료되며, 이후 기기는 30일 동안 로그인 상태를 유지합니다.
모든 기기를 로그아웃시키려면 서버 비밀번호를 바꾸세요(`opencode service set password ...`).

서버에 접속하는 다른 방법:

- **Tailscale 또는 Cloudflare Tunnel**: 서버 앞에 HTTPS 주소를 두고
  `opencode pair --url https://your-address`를 실행합니다.
- **같은 Wi-Fi**: `opencode service set hostname 0.0.0.0`을 실행한 다음 `opencode pair`를 실행합니다. 이때 QR 코드에는
  암호화되지 않은 `http://` LAN 주소가 들어 있습니다. 브라우저는 `https://` 페이지에서 이런 주소로의 접속을 차단합니다
  ("혼합 콘텐츠"). 최신 Chrome은 로컬 네트워크 접근 권한을 요청한 뒤 허용할 수도 있습니다(앱이 이 권한을 요청하지만 이
  경로는 검증되지 않았습니다). 그렇지 않으면 LAN에서 일반 HTTP로 앱을 제공하거나 위의 HTTPS 방법 중 하나를 사용하세요.
- **비밀번호**: 비밀번호 탭에서 서버 주소와 비밀번호를 입력합니다(1.x 서버, 또는 `OPENCODE_SERVER_PASSWORD`를 설정한
  `opencode serve`).

### 앱으로 설치하기

- **iPhone/iPad**: Safari에서 공유를 탭한 다음 홈 화면에 추가를 선택합니다. 설치된 앱은 자체 저장소를 쓰므로 앱 안에서
  한 번 더 페어링하세요.
- **Android**: Chrome에서 메뉴를 열고 앱 설치(또는 홈 화면에 추가)를 선택합니다.

## 보안

이 페이지는 여러분의 컴퓨터에서 셸 명령을 승인할 수 있으므로 방어적으로 만들어졌습니다.

- **백엔드 없음.** 여러분의 서버 외에는 어디에도 아무것도 보내지 않습니다. 분석 도구도, 서드파티 요청도 없습니다.
- **자격 증명은 로컬에.** 페어링 토큰(비밀번호를 쓰는 경우 비밀번호)은 이 브라우저의 저장소에 보관되며, "이 기기에
  기억하기"를 해제하면 세션 저장소에만 보관됩니다. URL 프래그먼트에 담긴 페어링 링크(`#pair=...`)는 웹 호스트로 전송되지
  않으며 주소 표시줄에서 즉시 제거됩니다.
- **신뢰할 수 없는 출력은 정제합니다.** 모델 출력에는 에이전트가 읽은 파일과 웹 페이지가 인용될 수 있으므로, Markdown은
  [marked](https://marked.js.org)로 렌더링하고 [DOMPurify](https://github.com/cure53/DOMPurify)로 정리합니다.
  원격 이미지와 `javascript:` 링크는 차단됩니다.
- **엄격한 콘텐츠 보안 정책.** 프로덕션 빌드는 인라인 스크립트, 서드파티 스크립트, 원격 이미지를 허용하지 않습니다.
- **프레임 금지.** 앱은 프레임 안에서 실행되기를 거부하므로 클릭재킹에 악용될 수 없습니다.

## 브라우저 지원

대상은 Chrome/Edge 111+, Firefox 115+, Safari 16+(iOS 16+)입니다. OpenCode 클라이언트가 쓰는 비교적 새로운 API는 작은
폴리필로 보완합니다. 엔드투엔드 테스트는 실제 OpenCode 서버를 상대로 Chromium, Firefox, WebKit에서 데스크톱, iPhone,
iPad, Android 크기(실제 기기가 아닌 기기 에뮬레이션)로 기능을 검증합니다.

## 제한 사항

- 페이지가 닫혀 있거나 휴대폰이 잠겨 있으면 알림을 받을 수 없습니다. 웹 푸시에는 푸시를 보낼 서버가 필요합니다. 탭이
  백그라운드에 열려 있는 동안에는 탭 제목에 배지가 표시되며, 설정에서 데스크톱 알림을 켤 수 있습니다.
- 아직 포함되지 않은 기능: 터미널(PTY), MCP 및 공급자 관리, 하위 에이전트 세션 탐색.

## 개발

```sh
npm install
npm run dev          # http://localhost:5173
npm run lab          # mock LLM + throwaway OpenCode server; prints a pairing link for the dev server
npm run build        # type-check and build into dist/
npm test             # end-to-end tests (see below)
```

`npm run lab`과 테스트는 OpenAI 호환 모의 모델인 `dev/mock-llm.mjs`를 사용하므로 API 키가 필요 없습니다.
다음 프롬프트로 특정 동작을 일으킬 수 있습니다.

| 프롬프트 | 모의 모델의 동작 |
| --- | --- |
| `shell: <command>` | 셸 도구를 호출(권한 요청) |
| `write: <path>` + 줄바꿈 + 내용 | 파일을 작성(권한 요청, 되돌리기, 변경 사항) |
| `ask: <question>` | 객관식 질문을 함 |
| `think` | 추론 과정을 스트리밍한 뒤 답변 |
| `slow` | 약 20초 동안 스트리밍(중지 테스트용) |
| `xss` | 악의적인 HTML로 답변(정제기 테스트용) |

### 테스트

Playwright 테스트 모음은 모의 LLM과 실제 OpenCode 2.x 서버로 이루어진 자체 실험 환경을, 일회용 데이터 디렉터리와 git
프로젝트로 시작합니다. 여러분의 OpenCode 환경은 전혀 건드리지 않습니다.

```sh
npx playwright install --with-deps chromium firefox webkit
OPENCODE_BIN=/path/to/opencode-2.x npm test                                # needs @opencode/cli 2.x
OPENCODE_V1_BIN=/path/to/opencode-1.x OPENCODE_BIN=... npm test            # also runs the 1.x suite
npx playwright test --project=iphone                                       # one device
```

프로젝트: `unit`(파싱과 내보내기 로직, 브라우저 없음), `desktop-chrome`, `desktop-firefox`, `desktop-safari`, `iphone`,
`ipad`, `android`. QR 페어링은 모든 브라우저에서 사진으로, Chromium에서는 실제(가짜 기기) 카메라 스트림으로도 테스트합니다.

### 번역

UI 텍스트는 `src/i18n/locales/`에 언어별로 파일 하나씩 있습니다. `en.ts`가 키를 정의하고, 다른 모든 카탈로그는 이를
기준으로 타입 검사를 받으며, 각 번역이 `{placeholders}`를 유지하는지 단위 테스트로 확인합니다. 언어를 추가하려면
`en.ts`를 복사해 번역한 뒤 `src/i18n/index.ts`에 등록하세요. OpenCode 데스크톱 앱이 영어로만 표시하는 레이블
(**Pairing**, **Pair device**, **Remote access**)은 화면에 보이는 것과 일치하도록 영어로 둡니다.

### 구조

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

## 라이선스

MIT
