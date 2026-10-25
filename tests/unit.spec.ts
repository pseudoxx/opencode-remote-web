// Pure logic: pairing input parsing, address ordering, tokens, exports. No browser or server needed.
import { expect, test } from "@playwright/test"
import {
  basicAuth,
  blockedAsMixedContent,
  isPrivateHost,
  normalizeServerUrl,
  orderPairingUrls,
  parseConnectInput,
  tokenExpiry,
} from "../src/lib/pairing"
import { sessionToMarkdown, toolSummary } from "../src/lib/export"
import { guessHostOS, osFromPaths } from "../src/lib/hostos"
import { detectLocale, LOCALES, setLanguage, t } from "../src/i18n"
import { en } from "../src/i18n/locales/en"
import { ja } from "../src/i18n/locales/ja"
import { zhCN } from "../src/i18n/locales/zh-CN"
import { zhTW } from "../src/i18n/locales/zh-TW"
import { es } from "../src/i18n/locales/es"
import { fr } from "../src/i18n/locales/fr"
import { ko } from "../src/i18n/locales/ko"
import type { Message, Session } from "../src/lib/types"

test("parses the QR payload printed by opencode pair", () => {
  const qr = JSON.stringify({ code: "Ua-Q4ew8ZQORCSwcJmnLLA", urls: ["http://192.168.1.4:49374/", "https://abc.tunnel.example"] })
  expect(parseConnectInput(qr)).toEqual({
    type: "pair",
    code: "Ua-Q4ew8ZQORCSwcJmnLLA",
    urls: ["http://192.168.1.4:49374", "https://abc.tunnel.example"],
  })
  expect(parseConnectInput('{"code":"x y","urls":["https://a.b"]}')).toBeUndefined()
  expect(parseConnectInput('{"code":"abcdefgh","urls":[]}')).toBeUndefined()
})

test("parses pairing links, including servers behind a path prefix", () => {
  expect(parseConnectInput("https://abc.tunnel.example/auth/connect/-RC5NKZWU1RSiO8exuku-w")).toEqual({
    type: "pair",
    code: "-RC5NKZWU1RSiO8exuku-w",
    urls: ["https://abc.tunnel.example"],
  })
  expect(parseConnectInput("  https://box.example/opencode/auth/connect/abcdefgh12  ")).toEqual({
    type: "pair",
    code: "abcdefgh12",
    urls: ["https://box.example/opencode"],
  })
  const appLink = "https://remote.example/#pair=" + encodeURIComponent("http://127.0.0.1:4096/auth/connect/abcdefgh12")
  expect(parseConnectInput(appLink)).toEqual({ type: "pair", code: "abcdefgh12", urls: ["http://127.0.0.1:4096"] })
})

test("parses bare addresses and credentials in URLs", () => {
  expect(parseConnectInput("my-mac.tailnet.ts.net")).toEqual({ type: "address", url: "https://my-mac.tailnet.ts.net" })
  expect(parseConnectInput("http://10.0.0.5:4096/")).toEqual({ type: "address", url: "http://10.0.0.5:4096" })
  expect(parseConnectInput("https://opencode:s%40cret@box.example")).toEqual({
    type: "password",
    url: "https://box.example",
    username: "opencode",
    password: "s@cret",
  })
  expect(normalizeServerUrl("localhost:4096")).toBe("http://localhost:4096")
  expect(normalizeServerUrl("ftp://x")).toBeUndefined()
  expect(parseConnectInput("not a link at all")).toBeUndefined()
})

test("orders pairing addresses by what an https page can reach", () => {
  const urls = ["http://192.168.1.4:49374", "http://127.0.0.1:49374", "https://abc.tunnel.example"]
  expect(orderPairingUrls(urls, "https:")).toEqual(["https://abc.tunnel.example", "http://127.0.0.1:49374", "http://192.168.1.4:49374"])
  expect(blockedAsMixedContent("http://192.168.1.4:49374", "https:")).toBe(true)
  expect(blockedAsMixedContent("http://localhost:4096", "https:")).toBe(false)
  expect(blockedAsMixedContent("http://192.168.1.4:49374", "http:")).toBe(false)
})

test("recognizes private network hosts", () => {
  for (const host of ["192.168.0.10", "10.1.2.3", "172.20.0.1", "100.101.102.103", "my-mac.local", "fd12:3456::1"]) expect(isPrivateHost(host)).toBe(true)
  for (const host of ["8.8.8.8", "172.32.0.1", "example.com", "100.200.1.1"]) expect(isPrivateHost(host)).toBe(false)
})

test("reads pairing token expiry and encodes non-ASCII passwords", () => {
  expect(tokenExpiry("1795426875.not-a-real-signature-just-the-format-0000")).toBe(1795426875000)
  expect(tokenExpiry("plain-password")).toBeUndefined()
  expect(basicAuth("opencode", "pässwörd")).toBe("Basic " + Buffer.from("opencode:pässwörd", "utf8").toString("base64"))
})

test("exports a conversation as Markdown with safe code fences", () => {
  const session = { id: "s", title: "Fix the bug", directory: "/work/app", created: 0, updated: 0, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0 } } as Session
  const messages: Message[] = [
    { kind: "user", id: "u1", created: 1, text: "please fix", attachments: [{ name: "log.txt", mime: "text/plain" }] },
    {
      kind: "assistant",
      id: "a1",
      created: 2,
      model: { providerID: "mock", id: "mock-fast" },
      parts: [
        { type: "reasoning", key: "r", text: "hidden thoughts" },
        { type: "tool", key: "t", id: "t", name: "shell", status: "completed", input: { command: "grep -r foo" }, output: "a ``` b" },
        { type: "text", key: "x", text: "Done." },
      ],
    },
    { kind: "notice", id: "n1", created: 3, tone: "muted", key: "notice.interrupted" },
  ]
  const md = sessionToMarkdown(session, messages)
  expect(md).toContain("# Fix the bug")
  expect(md).toContain("## User\n\nplease fix")
  expect(md).toContain("_Attachments: log.txt_")
  expect(md).toContain("## Assistant (mock/mock-fast)")
  expect(md).toContain("**Tool `shell`** — grep -r foo (completed)")
  expect(md).toContain("````\na ``` b\n````")
  expect(md).toContain("Done.")
  expect(md).not.toContain("hidden thoughts")
  expect(md).toContain("_Interrupted_")
})

test("summarizes tool calls by their most telling argument", () => {
  expect(toolSummary({ name: "shell", input: { command: "npm test", description: "run" } })).toBe("npm test")
  expect(toolSummary({ name: "edit", input: { path: "src/a.ts", oldString: "x" } })).toBe("src/a.ts")
  expect(toolSummary({ name: "question", input: { questions: [{ question: "Which one?" }] } })).toBe("Which one?")
  expect(toolSummary({ name: "x", input: { command: "a".repeat(300) } })).toHaveLength(158)
})

test("reads the server's OS from its paths", () => {
  expect(osFromPaths(["C:\\Users\\me\\AppData\\Local\\Temp\\opencode"])).toBe("windows")
  expect(osFromPaths(["/tmp/opencode", "/Users/me/code/app"])).toBe("macos")
  expect(osFromPaths(["/var/folders/xy/abc/T/opencode"])).toBe("macos")
  expect(osFromPaths(["/home/me/src"])).toBe("linux")
  expect(osFromPaths(["/srv/work", "/tmp/opencode"])).toBe("linux")
  expect(osFromPaths(["/srv/work", undefined])).toBeUndefined()
})

test("guesses the OpenCode computer's OS before it can be asked", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  const device = (platform: string, userAgent: string, maxTouchPoints = 0) =>
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { platform, userAgent, maxTouchPoints } })
  try {
    device("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")
    expect(guessHostOS({ known: "linux", serverUrl: "http://10.0.0.2:28894" })).toMatchObject({ os: "linux", certain: true })
    expect(guessHostOS({ serverUrl: "http://10.0.0.2:28894" }).os).toBe("windows")
    expect(guessHostOS({ serverUrl: "https://abc.tunnel.example", lastPick: "windows" }).os).toBe("windows")
    expect(guessHostOS({ serverUrl: "http://10.0.0.2:49374", lastPick: "windows" }).os).toBe("macos")
    expect(guessHostOS({ serverUrl: "https://abc.tunnel.example" }).os).toBe("macos")
    device("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    expect(guessHostOS({ serverUrl: "https://abc.tunnel.example" })).toMatchObject({ os: "windows", reason: "host.reasonDevice" })
    device("MacIntel", "Mozilla/5.0 (Macintosh)", 5)
    expect(guessHostOS({}).reason).toBe("host.reasonPick")
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original)
  }
})

test("picks the UI language from the system setting", () => {
  expect(detectLocale(["ja-JP", "en-US"])).toBe("ja")
  expect(detectLocale(["zh-TW"])).toBe("zh-TW")
  expect(detectLocale(["zh-HK"])).toBe("zh-TW")
  expect(detectLocale(["zh-Hant-MO"])).toBe("zh-TW")
  expect(detectLocale(["zh-CN"])).toBe("zh-CN")
  expect(detectLocale(["zh-SG"])).toBe("zh-CN")
  expect(detectLocale(["zh"])).toBe("zh-CN")
  expect(detectLocale(["de-DE", "es-MX"])).toBe("es")
  expect(detectLocale(["fr-CA"])).toBe("fr")
  expect(detectLocale(["ko-KR"])).toBe("ko")
  expect(detectLocale(["de-DE", "pt-BR"])).toBe("en")
  expect(detectLocale([])).toBe("en")
  expect(LOCALES.map((l) => l.id)).toEqual(["en", "ja", "zh-CN", "zh-TW", "es", "fr", "ko"])
})

test("every translation keeps the English placeholders", () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  const catalogs = { ja, "zh-CN": zhCN, "zh-TW": zhTW, es, fr, ko }
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const [key, source] of Object.entries(en)) {
      const target = catalog[key as keyof typeof en]
      const render = (m: unknown, count: number) => (typeof m === "function" ? m({ count }) : String(m).replace("{count}", String(count)))
      if (typeof source === "string" && typeof target === "string") {
        expect(placeholders(target), `${locale} ${key}`).toEqual(placeholders(source))
      } else {
        for (const count of [0, 1, 2, 5]) expect(render(target, count), `${locale} ${key}`).not.toMatch(/\{\w+\}/)
      }
    }
  }
})

test("translates with parameters and plurals", () => {
  try {
    setLanguage("en")
    expect(t("revert.files", { count: 1 })).toBe("1 file restored")
    expect(t("revert.files", { count: 3 })).toBe("3 files restored")
    expect(t("conn.pill", { status: "Live" })).toBe("Connection: Live")
    setLanguage("fr")
    expect(t("msg.filesChanged", { count: 0 })).toBe("0 fichier modifié")
    expect(t("msg.filesChanged", { count: 2 })).toBe("2 fichiers modifiés")
    setLanguage("ja")
    expect(t("msg.filesChanged", { count: 2 })).toBe("2 個のファイルを変更")
    setLanguage("zh-TW")
    expect(t("side.newSession")).toBe("新增工作階段")
  } finally {
    setLanguage("auto")
  }
})
