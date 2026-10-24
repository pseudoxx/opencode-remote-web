// OpenCode 1.x (opencode-ai) compatibility. Runs only when OPENCODE_V1_BIN points at a 1.x binary.
import { expect, test, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { password, send, unique, waitIdle } from "./helpers"

const v1 = () => process.env.E2E_V1_SERVER!
const gamma = () => process.env.E2E_GAMMA!

test.skip(() => !process.env.E2E_V1_SERVER, "set OPENCODE_V1_BIN to run the 1.x tests")

async function connectV1(page: Page) {
  await page.goto("/")
  await page.getByRole("tab", { name: "Password" }).click()
  await page.getByLabel("Server address").fill(v1())
  await page.getByLabel("Password", { exact: true }).fill(password())
  await page.getByRole("button", { name: "Connect", exact: true }).click()
  await expect(page.getByLabel("Message")).toBeVisible()
  await expect(page.getByRole("button", { name: /Connection: Live/ }).first()).toBeVisible()
}

test.beforeEach(async ({ page }) => connectV1(page))

test("1.x: chats, switches model, and shows the API version", async ({ page }) => {
  await send(page, "hello one-x")
  await expect(page.locator(".msg.assistant").last()).toContainText("You said: hello one-x")
  await expect(page.locator(".msg.assistant").last()).toContainText("mock-fast")
  await waitIdle(page)
  await page.getByLabel("Model").selectOption({ label: "Mock Smart" })
  await send(page, "second one-x")
  await expect(page.locator(".msg.assistant").last()).toContainText("mock-smart")
  await page.getByRole("button", { name: /Connection: Live/ }).first().click()
  await expect(page.locator("dialog[open]")).toContainText("1.x API")
})

test("1.x: permission approval runs the command", async ({ page }) => {
  const file = unique("v1-approved") + ".txt"
  await send(page, `shell: echo ok > ${file}`)
  const card = page.getByRole("alertdialog", { name: "Permission request" })
  await expect(card).toContainText(`echo ok > ${file}`)
  await card.getByRole("button", { name: "Allow once" }).click()
  await expect(page.locator(".msg.assistant").last()).toContainText("Tool finished")
  expect(fs.readFileSync(path.join(gamma(), file), "utf8").trim()).toBe("ok")
})

test("1.x: answers a question", async ({ page }) => {
  await send(page, "ask: Pick a color?")
  const form = page.getByRole("alertdialog", { name: "Question from the agent" })
  await form.getByText("Red", { exact: true }).click()
  await form.getByRole("button", { name: "Send answer" }).click()
  await expect(page.locator(".msg.assistant").last()).toContainText("Red")
})

test("1.x: revert and undo restore files", async ({ page }) => {
  const file = unique("v1-revert") + ".md"
  const target = path.join(gamma(), file)
  await send(page, `write: ${file}\n# from the 1.x agent`)
  await page.getByRole("alertdialog", { name: "Permission request" }).getByRole("button", { name: "Allow once" }).click()
  await expect(page.locator(".msg.assistant").last()).toContainText("Tool finished")
  await waitIdle(page)
  expect(fs.existsSync(target)).toBe(true)
  // 1.x records the turn's file patch just after the step ends; the "files changed" chip appears once it exists.
  await expect(page.getByRole("button", { name: /\d+ files? changed/ })).toBeVisible()
  const turn = page.locator(".msg.user", { hasText: file })
  await turn.hover()
  await turn.getByRole("button", { name: "Revert to here" }).click()
  await expect(page.locator(".revert-banner")).toContainText("Reverted to here")
  await expect.poll(() => fs.existsSync(target)).toBe(false)
  await expect(page.getByRole("button", { name: "Discard reverted messages" })).toHaveCount(0)
  await page.getByRole("button", { name: "Undo revert" }).click()
  await expect(page.locator(".revert-banner")).toHaveCount(0)
  await expect.poll(() => fs.existsSync(target)).toBe(true)
})

test("1.x: stops a running agent", async ({ page }) => {
  await send(page, "slow")
  await expect(page.locator(".msg.assistant").last()).toContainText("Working slowly")
  await page.getByRole("button", { name: "Stop" }).click()
  await expect(page.locator(".working")).toHaveCount(0)
})
