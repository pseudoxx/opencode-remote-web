import { expect, test } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import {
  alpha,
  api,
  beta,
  connect,
  isMobileLayout,
  newSession,
  openSidebar,
  pairingLink,
  password,
  send,
  server,
  unique,
  waitIdle,
} from "./helpers"

test.describe("connecting", () => {
  test("pastes a pairing link and streams a markdown reply", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("tab", { name: "Paste link" }).click()
    await page.getByLabel("Pairing link or server address").fill(await pairingLink())
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.getByRole("button", { name: /Connection: Live/ }).first()).toBeVisible()

    await send(page, "hello from the test")
    const reply = page.locator(".msg.assistant").last()
    await expect(reply).toContainText("You said: hello from the test")
    await expect(reply.locator("table")).toBeVisible()
    await expect(reply.locator("pre code")).toHaveText("const answer = 42")
    await expect(page.locator(".msg.user").last()).toContainText("hello from the test")
  })

  test("a pairing link in the URL fragment connects and is scrubbed from the address bar", async ({ page }) => {
    await page.goto("/#pair=" + encodeURIComponent(await pairingLink()))
    await expect(page.getByLabel("Message")).toBeVisible()
    expect(new URL(page.url()).hash).toBe("")
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ocr:servers") ?? "[]"))
    expect(saved).toHaveLength(1)
    expect(saved[0].auth).toBe("token")
    expect(saved[0].secret).not.toContain(password())
  })

  test("a used pairing link explains what to do", async ({ page }) => {
    const link = await pairingLink()
    const res = await fetch(link, { headers: { accept: "application/json" } })
    expect(res.ok).toBe(true)
    await page.goto("/")
    await page.getByRole("tab", { name: "Paste link" }).click()
    await page.getByLabel("Pairing link or server address").fill(link)
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.getByText("expired or was already used")).toBeVisible()
  })

  test("password login, and a wrong password is rejected", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("tab", { name: "Password" }).click()
    await page.getByLabel("Server address").fill(server())
    await page.getByLabel("Password", { exact: true }).fill("not-the-password")
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.getByText("rejected these credentials")).toBeVisible()

    await page.getByLabel("Password", { exact: true }).fill(password())
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.getByRole("button", { name: /Connection: Live/ }).first()).toBeVisible()
  })

  test("explains CORS when this app's origin is not allowed", async ({ page, baseURL, browserName }) => {
    // Serve the same build from an origin the server does not allow (127.0.0.2 is loopback, but not on its list).
    const foreign = "http://127.0.0.2:" + new URL(baseURL!).port
    await page.route(`${foreign}/**`, async (route) => {
      const url = new URL(route.request().url())
      const response = await route.fetch({ url: baseURL + url.pathname + url.search })
      await route.fulfill({ response })
    })
    await page.goto(foreign + "/")
    await page.getByRole("tab", { name: "Paste link" }).click()
    await page.getByLabel("Pairing link or server address").fill(await pairingLink())
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    // Chromium hides whether a local server answered (Local Network Access blocks the no-cors probe), so there the
    // app can only say "unreachable or blocked" and still offers the CORS fix.
    const message = browserName === "chromium" ? /does not allow this app's origin|Could not reach/ : /does not allow this app's origin/
    const help = page.locator(".note.error").first()
    await expect(help).toContainText(message)
    const commands = () => help.locator(".cmd code").allTextContents()

    await help.getByRole("radio", { name: "Windows" }).click()
    expect(await commands()).toEqual([
      `& "$env:LOCALAPPDATA\\Programs\\@opencodedesktop\\resources\\opencode-cli.exe" service set cors "${foreign}"`,
      `& "$env:LOCALAPPDATA\\Programs\\@opencodedesktop\\resources\\opencode-cli.exe" service restart`,
      `opencode service set cors "${foreign}"`,
      "opencode service restart",
    ])
    await help.getByRole("radio", { name: "macOS" }).click()
    expect((await commands())[0]).toBe(`"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors ${foreign}`)
    await help.getByRole("radio", { name: "Linux" }).click()
    expect((await commands()).slice(0, 2)).toEqual([`opencode service set cors ${foreign}`, "opencode service restart"])
    if (process.env.E2E_SCREENSHOT) await page.screenshot({ path: process.env.E2E_SCREENSHOT, fullPage: true })

    // The pick is remembered for the next time help is shown.
    await help.getByRole("radio", { name: "Windows" }).click()
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.locator(".note.error").first().getByRole("radio", { name: "Windows" })).toHaveAttribute("aria-checked", "true")
  })

  test("a saved server that is down shows the problem on the server list", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "ocr:servers",
        JSON.stringify([{ id: "dead", name: "dead box", url: "http://127.0.0.1:4999", username: "opencode", secret: "x", auth: "password", remember: true, added: Date.now() }]),
      )
      localStorage.setItem("ocr:prefs", JSON.stringify({ lastServer: "dead" }))
    })
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Your servers" })).toBeVisible()
    await expect(page.locator(".note.error").first()).toContainText("Could not reach http://127.0.0.1:4999")
  })

  test("remembers the server and the open session across reloads", async ({ page }) => {
    await connect(page)
    const word = unique("persist")
    await send(page, word)
    await expect(page.locator(".msg.assistant").last()).toContainText(word)
    await page.reload()
    await expect(page.getByRole("button", { name: /Connection: Live/ }).first()).toBeVisible()
    await expect(page.locator(".msg.user").last()).toContainText(word)
  })
})

test.describe("conversation", () => {
  test.beforeEach(async ({ page }) => connect(page))

  test("switches model and reasoning effort for the session", async ({ page }) => {
    await send(page, "first")
    await expect(page.locator(".msg.assistant").last()).toContainText("mock-fast")
    await waitIdle(page)
    await page.getByLabel("Model").selectOption({ label: "Mock Smart" })
    await page.getByLabel("Reasoning effort").selectOption("high")
    await send(page, "second")
    await expect(page.locator(".msg.assistant").last()).toContainText("mock-smart")
    await expect(page.locator(".notice", { hasText: "Model → mock/mock-smart" }).first()).toBeVisible()
    await expect(page.locator(".topbar-title small")).toContainText("mock-smart (high)")
  })

  test("approves a permission request and the command runs", async ({ page }) => {
    const file = unique("approved") + ".txt"
    await send(page, `shell: echo approved > ${file}`)
    const card = page.getByRole("alertdialog", { name: "Permission request" })
    await expect(card).toContainText("Run a shell command")
    await expect(card).toContainText(`echo approved > ${file}`)
    await card.getByRole("button", { name: "Allow once" }).click()
    await expect(card).toHaveCount(0)
    await expect(page.locator(".tool.completed", { hasText: "shell" }).first()).toBeVisible()
    await expect(page.locator(".msg.assistant").last()).toContainText("Tool finished")
    expect(fs.readFileSync(path.join(alpha(), file), "utf8").trim()).toBe("approved")
  })

  test("rejects a permission request with a note for the agent", async ({ page }) => {
    const file = unique("rejected") + ".txt"
    await send(page, `shell: echo nope > ${file}`)
    const card = page.getByRole("alertdialog", { name: "Permission request" })
    await card.getByRole("button", { name: "Reject" }).click()
    await card.getByPlaceholder(/what to do instead/).fill("do not touch files")
    await card.getByRole("button", { name: "Reject" }).click()
    await expect(card).toHaveCount(0)
    await expect(page.locator(".tool.error", { hasText: "shell" }).first()).toBeVisible()
    expect(fs.existsSync(path.join(alpha(), file))).toBe(false)
  })

  test("answers a question from the agent", async ({ page }) => {
    await send(page, "ask: Which color do you like?")
    const form = page.getByRole("alertdialog", { name: "Question from the agent" })
    await expect(form).toContainText("Which color do you like?")
    await form.getByText("Blue", { exact: true }).click()
    await form.getByRole("button", { name: "Send answer" }).click()
    await expect(form).toHaveCount(0)
    await expect(page.locator(".msg.assistant").last()).toContainText('"Which color do you like?"="Blue"')
  })

  test("reverts a turn with its file changes, undoes it, then discards it", async ({ page }) => {
    page.on("dialog", (d) => d.accept())
    const file = unique("revert") + ".md"
    const target = path.join(alpha(), file)
    await send(page, "warm up")
    await expect(page.locator(".msg.assistant").last()).toContainText("warm up")
    await waitIdle(page)
    await send(page, `write: ${file}\n# created by the agent`)
    await page.getByRole("alertdialog", { name: "Permission request" }).getByRole("button", { name: "Allow once" }).click()
    await expect(page.locator(".msg.assistant").last()).toContainText("Tool finished")
    await waitIdle(page)
    expect(fs.existsSync(target)).toBe(true)

    const turn = page.locator(".msg.user", { hasText: file })
    await turn.hover()
    await turn.getByRole("button", { name: "Revert to here" }).click()
    const banner = page.locator(".revert-banner")
    await expect(banner).toContainText("Reverted to here")
    // Snapshots cover the whole worktree, so a file another test writes meanwhile is restored too.
    await expect(banner).toContainText(/\d+ files? restored/)
    await expect.poll(() => fs.existsSync(target)).toBe(false)
    await expect(page.getByLabel("Message")).toHaveValue(new RegExp(`write: ${file}`))
    await expect(page.locator(".msg.reverted").first()).toBeVisible()

    await banner.getByRole("button", { name: "Undo revert" }).click()
    await expect(banner).toHaveCount(0)
    await expect.poll(() => fs.existsSync(target)).toBe(true)

    await page.getByLabel("Message").fill("")
    await turn.hover()
    await turn.getByRole("button", { name: "Revert to here" }).click()
    await expect(banner).toBeVisible()
    await banner.getByRole("button", { name: "Discard reverted messages" }).click()
    await expect(page.locator(".msg.user", { hasText: file })).toHaveCount(0)
    await expect(page.locator(".msg.user", { hasText: "warm up" })).toBeVisible()
    expect(fs.existsSync(target)).toBe(false)
  })

  test("shows the files a turn changed", async ({ page }) => {
    const file = unique("changes") + ".md"
    await send(page, `write: ${file}\nline one\nline two`)
    await page.getByRole("alertdialog", { name: "Permission request" }).getByRole("button", { name: "Allow once" }).click()
    await expect(page.locator(".msg.assistant").last()).toContainText("Tool finished")
    await waitIdle(page)
    // Snapshots cover the whole worktree, so files written by tests running in parallel can show up too.
    await page.getByRole("button", { name: /\d+ files? changed/ }).click()
    const dialog = page.locator("dialog[open]")
    await expect(dialog).toContainText("Changes in this turn")
    await expect(dialog).toContainText(file)
    const head = dialog.locator(".change-head", { hasText: file })
    if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
    await expect(dialog.locator(".patch .add", { hasText: "line one" })).toBeVisible()
    await dialog.getByRole("button", { name: "Close" }).click()

    await page.getByRole("button", { name: "Session menu" }).click()
    await page.getByRole("menuitem", { name: "View changes" }).click()
    await expect(page.locator("dialog[open]")).toContainText(file)
  })

  test("keeps a separate draft per session", async ({ page }) => {
    await send(page, "draft owner")
    await expect(page.locator(".msg.assistant").last()).toContainText("draft owner")
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("ocr:servers")!)[0].lastSession as string)
    await page.getByLabel("Message").fill("unsent text for the first session")
    await newSession(page)
    await expect(page.getByLabel("Message")).toHaveValue("")
    await page.getByLabel("Message").fill("unsent text for a new session")
    await openSidebar(page)
    await page.locator(`.session-list li[data-id="${first}"] .session-item`).click()
    await expect(page.getByLabel("Message")).toHaveValue("unsent text for the first session")
    await newSession(page)
    await expect(page.getByLabel("Message")).toHaveValue("unsent text for a new session")
  })

  test("stops a running agent", async ({ page }) => {
    await send(page, "slow")
    await expect(page.locator(".working")).toBeVisible()
    await expect(page.locator(".msg.assistant").last()).toContainText("Working slowly")
    await page.getByRole("button", { name: "Stop" }).click()
    await expect(page.locator(".working")).toHaveCount(0)
    await expect(page.locator(".notice", { hasText: "Interrupted" }).last()).toBeVisible()
  })

  test("shows the model's reasoning on demand", async ({ page }) => {
    await send(page, "think")
    await expect(page.locator(".msg.assistant").last()).toContainText("Thought about it")
    await page.getByRole("button", { name: "Thought process" }).click()
    await expect(page.locator(".reasoning-body")).toContainText("step by step")
  })

  test("runs a shell command with !", async ({ page }) => {
    const word = unique("bang")
    await send(page, `!echo ${word}`)
    const notice = page.locator(".notice", { hasText: `$ echo ${word}` })
    await expect(notice).toBeVisible()
    await notice.getByRole("button").click()
    await expect(notice.locator(".notice-detail")).toContainText(word)
  })

  test("attaches a file to a prompt", async ({ page }) => {
    await page.locator(".composer input[type=file]").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("attached content"),
    })
    await expect(page.locator(".composer .chip")).toContainText("notes.txt")
    await send(page, "summarize the attachment")
    await expect(page.locator(".msg.user").last().locator(".chip")).toContainText("notes.txt")
    await expect(page.locator(".msg.assistant").last()).toContainText("summarize the attachment")
  })

  test("renders untrusted model output safely", async ({ page }) => {
    let dialogs = 0
    page.on("dialog", (d) => {
      dialogs++
      d.dismiss()
    })
    await send(page, "xss")
    const reply = page.locator(".msg.assistant").last()
    await expect(reply).toContainText("Untrusted output test")
    await expect(reply.getByRole("link", { name: "safe link" })).toHaveAttribute("rel", /noopener/)
    expect(await reply.locator("script").count()).toBe(0)
    expect(await reply.locator("[onerror], [onclick]").count()).toBe(0)
    await expect(reply.locator("a", { hasText: "click me" })).not.toHaveAttribute("href", /.*/)
    for (const img of await reply.locator("img").all()) expect(await img.getAttribute("src")).toBeNull()
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
    expect(dialogs).toBe(0)
  })
})

test.describe("sessions and projects", () => {
  test.beforeEach(async ({ page }) => connect(page))

  test("renames, searches, forks and deletes sessions", async ({ page }) => {
    page.on("dialog", (d) => d.accept())
    const title = unique("Renamed")
    await send(page, "a session to manage")
    await expect(page.locator(".msg.assistant").last()).toContainText("a session to manage")
    await waitIdle(page)

    await page.getByRole("button", { name: "Session menu" }).click()
    await page.getByRole("menuitem", { name: "Rename" }).click()
    await page.getByLabel("Title", { exact: true }).fill(title)
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.locator(".topbar .title-btn")).toHaveText(title)

    await openSidebar(page)
    await page.getByPlaceholder("Search sessions").fill(title)
    await expect(page.locator(".session-list li")).toHaveCount(1)
    await expect(page.locator(".session-list li").first()).toContainText(title)

    await page.getByRole("button", { name: `Actions for ${title}` }).click()
    await page.getByRole("menuitem", { name: "Fork" }).click()
    await expect(page.getByText("Forked into a new session")).toBeVisible()
    await expect(page.locator(".topbar .title-btn")).toHaveText(`${title} (fork #1)`)
    await expect(page.locator(".msg.user", { hasText: "a session to manage" })).toBeVisible()

    await openSidebar(page)
    await expect(page.locator(".session-list li", { hasText: title })).toHaveCount(2)
    await page.getByRole("button", { name: `Actions for ${title} (fork #1)` }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(page.getByText("Session deleted")).toBeVisible()
    await openSidebar(page)
    await expect(page.locator(".session-list li", { hasText: title })).toHaveCount(1)
    await expect(page.getByRole("heading", { name: "New session" })).toBeVisible()
  })

  test("opens another project folder and starts a session there", async ({ page }) => {
    await openSidebar(page)
    await page.locator(".project-chip").click()
    await page.getByRole("button", { name: "Open another folder…" }).click()
    const dialog = page.locator("dialog[open]")
    await dialog.locator("input.mono").fill(path.dirname(beta()))
    await dialog.getByRole("button", { name: "Go" }).click()
    await dialog.locator(".dir-list button", { hasText: "beta" }).click()
    await expect(dialog.locator("input.mono")).toHaveValue(beta())
    await dialog.getByRole("button", { name: "Open this folder" }).click()
    await openSidebar(page)
    await expect(page.locator(".project-chip strong")).toHaveText("beta")
    await expect(page.locator(".session-list")).toContainText("Seed beta")
    await page.locator(".sidebar").getByRole("button", { name: "New session" }).click()
    if (isMobileLayout(page)) await expect(page.locator(".workspace.drawer-open")).toHaveCount(0)
    const word = unique("in-beta")
    await send(page, word)
    await expect(page.locator(".msg.assistant").last()).toContainText(word)
    const sessions = (await api(`/api/session?directory=${encodeURIComponent(beta())}&limit=50`)) as { data: { title?: string; location: { directory: string } }[] }
    expect(sessions.data.every((s) => s.location.directory === beta())).toBe(true)
  })

  test("exports Markdown and JSON and copies the conversation", async ({ page, browserName, context }) => {
    const word = unique("export")
    await send(page, word)
    await expect(page.locator(".msg.assistant").last()).toContainText(word)
    await waitIdle(page)

    await page.getByRole("button", { name: "Session menu" }).click()
    const [md] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Markdown" }).click()])
    const mdText = fs.readFileSync((await md.path())!, "utf8")
    expect(md.suggestedFilename()).toMatch(/\.md$/)
    expect(mdText).toContain("## User")
    expect(mdText).toContain(word)
    expect(mdText).toContain("## Assistant (mock/mock-fast)")

    await page.getByRole("button", { name: "Session menu" }).click()
    const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download JSON" }).click()])
    const data = JSON.parse(fs.readFileSync((await json.path())!, "utf8"))
    expect(data.info.id).toBeTruthy()
    expect(JSON.stringify(data.messages)).toContain(word)

    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.getByRole("button", { name: "Session menu" }).click()
    await page.getByRole("menuitem", { name: "Copy conversation (Markdown)" }).click()
    if (browserName === "chromium") {
      await expect(page.getByText("Conversation copied as Markdown")).toBeVisible()
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(word)
      await page.locator(".msg.assistant").last().getByRole("button", { name: "Copy code" }).click()
      await expect(page.locator(".msg.assistant").last().locator(".code-copy")).toHaveText("Copied")
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("const answer = 42\n")
    } else {
      await expect(page.locator(".toast").last()).toContainText(/copied|Copy failed/)
    }
  })
})

test.describe("connection health", () => {
  test.beforeEach(async ({ page }) => connect(page))

  test("reconnects after the event stream drops", async ({ page }) => {
    await page.route("**/api/event", (route) => route.abort())
    // A tab returning to the foreground or the network coming back forces a fresh stream.
    await page.evaluate(() => window.dispatchEvent(new Event("online")))
    await expect(page.locator(".conn-banner")).toContainText(/Reconnecting/)
    await page.unroute("**/api/event")
    await expect(page.locator(".conn-banner")).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByRole("button", { name: /Connection: Live/ }).first()).toBeVisible()
    const word = unique("after-reconnect")
    await send(page, word)
    await expect(page.locator(".msg.assistant").last()).toContainText(word)
  })

  test("goes offline and comes back", async ({ page, context, browserName }) => {
    test.skip(browserName === "webkit", "WebKit's offline emulation does not fire online/offline events")
    await context.setOffline(true)
    await expect(page.locator(".conn-banner")).toContainText(/offline|Reconnecting/i)
    await context.setOffline(false)
    await expect(page.locator(".conn-banner")).toHaveCount(0, { timeout: 25_000 })
  })

  test("connection test reports latency and heartbeat", async ({ page }) => {
    await page.getByRole("button", { name: /Connection: Live/ }).first().click()
    const dialog = page.locator("dialog[open]")
    await expect(dialog).toContainText(`v${process.env.E2E_OPENCODE_VERSION?.match(/\d+\.\d+\.\d+/)?.[0]}`)
    // The lab server runs on Linux; the app learns that from its paths after connecting.
    await expect(dialog).toContainText(/Computer\s*Linux/)
    await dialog.getByRole("button", { name: "Test connection" }).click()
    await expect(dialog).toContainText("5/5 requests OK")
    await expect(dialog).toContainText(/Last heartbeat/)
  })
})

test("mobile drawer opens and closes around navigation", async ({ page }) => {
  test.skip(!isMobileLayout(page), "phones only")
  await connect(page)
  await send(page, "drawer test")
  await expect(page.locator(".msg.assistant").last()).toContainText("drawer test")
  await newSession(page)
  await expect(page.getByRole("heading", { name: "New session" })).toBeVisible()
  await openSidebar(page)
  await page.locator(".session-list .session-item").first().click()
  await expect(page.locator(".workspace.drawer-open")).toHaveCount(0)
  await expect(page.locator(".msg.user").first()).toBeVisible()
})
