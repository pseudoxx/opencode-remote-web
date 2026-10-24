import { expect, type Page } from "@playwright/test"
import path from "node:path"

export const server = () => process.env.E2E_SERVER!
export const password = () => process.env.E2E_PASSWORD!
export const alpha = () => process.env.E2E_ALPHA!
export const beta = () => process.env.E2E_BETA!
export const basic = () => "Basic " + Buffer.from(`opencode:${password()}`).toString("base64")

export async function api(pathname: string, init: RequestInit = {}) {
  const res = await fetch(server() + pathname, {
    ...init,
    headers: { authorization: basic(), "content-type": "application/json", ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname} -> ${res.status} ${await res.text()}`)
  return res.status === 204 ? undefined : res.json()
}

// What `opencode pair` prints: a one-time link that the app exchanges for a session token.
export async function pairingLink() {
  const { code } = (await api("/api/pair", { method: "POST" })) as { code: string }
  return `${server()}/auth/connect/${code}`
}

export const isMobileLayout = (page: Page) => (page.viewportSize()?.width ?? 1200) < 900

export async function openSidebar(page: Page) {
  if (isMobileLayout(page) && !(await page.locator(".workspace.drawer-open").count())) {
    await page.getByRole("button", { name: "Open sessions" }).click()
    await expect(page.locator(".sidebar")).toBeVisible()
  }
}

export async function connect(page: Page, opts: { project?: string } = {}) {
  await page.goto("/#pair=" + encodeURIComponent(await pairingLink()))
  await expect(page.getByLabel("Message")).toBeVisible()
  await expect(page.getByRole("button", { name: /Connection: Live/ }).first()).toBeVisible()
  await selectProject(page, opts.project ?? alpha())
}

export async function selectProject(page: Page, directory: string) {
  const name = path.basename(directory)
  await openSidebar(page)
  const chip = page.locator(".project-chip")
  if ((await chip.locator("strong").textContent())?.trim() !== name) {
    await chip.click()
    await page.locator("dialog[open] .pick-list button", { hasText: name }).first().click()
  }
  await expect(chip.locator("strong")).toHaveText(name)
  await closeSidebar(page)
}

export async function closeSidebar(page: Page) {
  if (isMobileLayout(page) && (await page.locator(".workspace.drawer-open").count())) {
    await page.locator(".scrim").click({ position: { x: (page.viewportSize()?.width ?? 400) - 10, y: 200 } })
    await expect(page.locator(".workspace.drawer-open")).toHaveCount(0)
  }
}

export async function newSession(page: Page) {
  await openSidebar(page)
  await page.locator(".sidebar").getByRole("button", { name: "New session" }).click()
  await closeSidebar(page)
}

export async function send(page: Page, text: string) {
  const box = page.getByLabel("Message")
  await box.fill(text)
  await page.getByRole("button", { name: "Send" }).click()
  await expect(box).toHaveValue("")
}

export function unique(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export async function waitIdle(page: Page) {
  await expect(page.locator(".working")).toHaveCount(0, { timeout: 20_000 })
}
