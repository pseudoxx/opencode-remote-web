// Captures the main screens for a visual review: node dev/screens.mjs <pairingLink> [outDir]
// Needs the app on http://localhost:4173 (npm run build && npx vite preview) and the server behind the link
// using the mock LLM (npm run lab).
import { chromium } from "@playwright/test"
import fs from "node:fs"

const [link, out = "screens"] = process.argv.slice(2)
if (!link) throw new Error("usage: node dev/screens.mjs <pairingLink> [outDir]")
fs.mkdirSync(out, { recursive: true })
const app = process.env.APP_URL ?? "http://localhost:4173/"

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const page = await context.newPage()
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` })
const send = async (text) => {
  await page.getByLabel("Message").fill(text)
  await page.getByRole("button", { name: "Send" }).click()
}

await page.goto(app + "#pair=" + encodeURIComponent(link))
await page.getByLabel("Message").waitFor()
await page.waitForTimeout(1500)
// File changes are only tracked in git projects; pick one if PROJECT is given (its folder name).
if (process.env.PROJECT) {
  await page.getByRole("button", { name: "Open sessions" }).click()
  await page.locator(".project-chip").click()
  await page.locator("dialog[open] .pick-list button", { hasText: process.env.PROJECT }).first().click()
  await page.waitForTimeout(800)
}
await shot("01-empty")

await send("think")
await page.getByText("Thought about it").waitFor()
await send("shell: ls -la")
await page.getByRole("alertdialog", { name: "Permission request" }).waitFor()
await page.waitForTimeout(500)
await shot("02-permission")
await page.getByRole("button", { name: "Allow once" }).click()
await page.getByText("Tool finished").last().waitFor()

const file = `notes-${Date.now()}.md`
await send(`write: ${file}\n# Notes\n\n- one\n- two`)
await page.getByRole("button", { name: "Allow once" }).click()
await page.waitForTimeout(2500)
await page.locator(".tool", { hasText: "write" }).first().click()
await page.waitForTimeout(300)
await shot("03-tool-diff")
await page.getByRole("button", { name: /files? changed/ }).first().click()
await page.locator("dialog[open] .patch").waitFor()
await shot("04-changes")
await page.locator("dialog[open]").getByRole("button", { name: "Close" }).click()
await page.waitForTimeout(300)
console.log("after close:", await page.evaluate(() => ({
  openDialogs: document.querySelectorAll("dialog[open]").length,
  send: document.querySelector("button[aria-label=Send]")?.disabled,
  stop: !!document.querySelector("button[aria-label=Stop]"),
  value: document.querySelector("textarea[aria-label=Message]")?.value,
})))

await send("ask: Which database should we use?")
await page.getByRole("alertdialog", { name: "Question from the agent" }).waitFor()
await page.waitForTimeout(400)
await shot("05-question")
await page.getByText("Blue", { exact: true }).click()
await page.getByRole("button", { name: "Send answer" }).click()
await page.waitForTimeout(2500)

const turn = page.locator(".msg.user", { hasText: file })
await turn.getByRole("button", { name: "Revert to here" }).click()
await page.locator(".revert-banner").waitFor()
await page.locator(".revert-banner").scrollIntoViewIfNeeded()
await shot("06-revert")
await page.getByRole("button", { name: "Undo revert" }).click()

await page.getByRole("button", { name: "Open sessions" }).click()
await page.waitForTimeout(400)
await shot("07-drawer")
await page.locator(".scrim").click({ position: { x: 380, y: 300 } })

await page.getByRole("button", { name: /Connection:/ }).first().click()
await page.getByRole("button", { name: "Test connection" }).click()
await page.getByText("requests OK").waitFor()
await shot("08-connection")
await page.keyboard.press("Escape")

await page.emulateMedia({ colorScheme: "dark" })
await page.waitForTimeout(300)
await shot("09-dark")

await page.setViewportSize({ width: 1280, height: 820 })
await page.waitForTimeout(500)
await shot("10-desktop-dark")
await page.emulateMedia({ colorScheme: "light" })
await page.waitForTimeout(300)
await shot("11-desktop-light")
await browser.close()
console.log("saved to", out)
