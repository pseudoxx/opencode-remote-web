// Quick visual smoke run against a local OpenCode v2 service: node dev/smoke.mjs [outDir]
// Needs: the app on http://localhost:4173 (npm run build && npx vite preview), `opencode` v2 on PATH or OPENCODE_BIN.
import { chromium } from "@playwright/test"
import { execFileSync } from "node:child_process"
import fs from "node:fs"

const out = process.argv[2] ?? "shots"
fs.mkdirSync(out, { recursive: true })
const app = process.env.APP_URL ?? "http://localhost:4173/"

function pairLink() {
  const bin = process.env.OPENCODE_BIN ?? "opencode"
  const text = execFileSync(bin, ["pair"], { encoding: "utf8" })
  const link = /(https?:\/\/\S+\/auth\/connect\/\S+)/.exec(text)?.[1]
  if (!link) throw new Error("no pairing link in:\n" + text)
  return link
}

const browser = await chromium.launch()
for (const [name, viewport, mobile] of [
  ["phone", { width: 390, height: 844 }, true],
  ["desktop", { width: 1280, height: 820 }, false],
]) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const errors = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(app)
  await page.screenshot({ path: `${out}/${name}-1-connect.png` })
  await page.getByRole("tab", { name: "Paste link" }).click()
  await page.getByLabel("Pairing link or server address").fill(pairLink())
  await page.getByRole("button", { name: "Connect", exact: true }).click()
  await page.getByLabel("Message").waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/${name}-2-workspace.png` })
  console.log(name, "composer", await page.evaluate(() => {
    const t = document.querySelector("textarea[aria-label=Message]")
    const cs = getComputedStyle(t)
    return { h: t.offsetHeight, sh: t.scrollHeight, w: t.offsetWidth, lh: cs.lineHeight, pad: cs.padding, style: t.getAttribute("style") }
  }))
  await page.getByLabel("Message").fill(`hello from the ${name}`)
  await page.getByRole("button", { name: "Send" }).click()
  await page.getByText(`You said:`).last().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/${name}-3-chat.png` })
  console.log(name, "after send", await page.evaluate(() => {
    const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)] }
    return { row: box(".input-row"), textarea: box("textarea[aria-label=Message]"), clip: box(".input-row .icon-btn"), style: document.querySelector("textarea[aria-label=Message]").getAttribute("style") }
  }))
  console.log(name, errors.length ? errors : "no console errors")
  await context.close()
}
await browser.close()
