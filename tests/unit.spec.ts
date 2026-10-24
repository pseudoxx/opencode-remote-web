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
    { kind: "notice", id: "n1", created: 3, tone: "muted", text: "Interrupted" },
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
