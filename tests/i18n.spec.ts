// The UI language follows the system setting, can be switched, and is remembered.
import { expect, test } from "@playwright/test"
import { connect, openSidebar } from "./helpers"

test.describe("Japanese system language", () => {
  test.use({ locale: "ja-JP" })

  test("shows the app in Japanese", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "OpenCode に接続" })).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "ja")
    await expect(page.getByRole("tab", { name: "リンクを貼り付け" })).toBeVisible()
    await expect(page.getByLabel("言語")).toHaveValue("auto")
  })
})

test.describe("Hong Kong system language", () => {
  test.use({ locale: "zh-HK" })

  test("uses Traditional Chinese", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "連線到你的 OpenCode" })).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW")
  })
})

test.describe("Korean system language", () => {
  test.use({ locale: "ko-KR" })

  test("shows the workspace in Korean after connecting", async ({ page }) => {
    // connect() expects the English Message box, so pick English first, then switch to the system language.
    await page.goto("/")
    await page.getByLabel("언어").selectOption("en")
    await connect(page)
    await openSidebar(page)
    await page.locator(".sidebar").getByRole("button", { name: "Settings" }).click()
    await page.locator("dialog[open]").getByLabel("Language").selectOption("auto")
    await expect(page.locator("dialog[open] h2")).toHaveText("설정")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("textbox", { name: "메시지" })).toBeVisible()
    await expect(page.getByRole("button", { name: /연결: 연결됨/ }).first()).toBeVisible()
  })
})

test("switching language on the connect screen sticks across reloads", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Connect to your OpenCode" })).toBeVisible()
  await page.getByLabel("Language").selectOption("es")
  await expect(page.getByRole("heading", { name: "Conéctate a tu OpenCode" })).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("lang", "es")
  await page.reload()
  await expect(page.getByRole("heading", { name: "Conéctate a tu OpenCode" })).toBeVisible()
  await page.getByLabel("Idioma").selectOption("zh-CN")
  await expect(page.getByRole("heading", { name: "连接到你的 OpenCode" })).toBeVisible()
  await page.getByLabel("语言").selectOption("auto")
  await expect(page.getByRole("heading", { name: "Connect to your OpenCode" })).toBeVisible()
})
