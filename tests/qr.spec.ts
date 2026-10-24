// Pairing by QR code, the way `opencode pair` is meant to be used from a phone.
import { chromium, expect, test } from "@playwright/test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import QRCode from "qrcode"
import { pairingLink, server } from "./helpers"

async function qrPayload() {
  const code = (await pairingLink()).split("/auth/connect/")[1]
  // The same shape `opencode pair` encodes: the code plus every reachable address.
  return JSON.stringify({ code, urls: ["http://192.168.255.254:49374", server()] })
}

test("pairs from a photo of the QR code", async ({ page }) => {
  const png = await QRCode.toBuffer(await qrPayload(), { width: 600, margin: 4 })
  await page.goto("/")
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: png })
  await expect(page.getByLabel("Message")).toBeVisible()
  await expect(page.getByRole("button", { name: /Connection: Live/ }).first()).toBeVisible()
})

// Chromium can feed a video file to getUserMedia as a fake camera. A Y4M file is raw YUV, so the QR code can be
// drawn straight from its module matrix without any image codec.
function qrVideo(text: string, file: string) {
  const W = 640
  const H = 480
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" })
  const size = qr.modules.size
  const scale = Math.floor((H - 80) / (size + 8))
  const offX = Math.floor((W - size * scale) / 2)
  const offY = Math.floor((H - size * scale) / 2)
  const y = Buffer.alloc(W * H, 235)
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++)
      if (qr.modules.get(row, col))
        for (let dy = 0; dy < scale; dy++) y.fill(16, (offY + row * scale + dy) * W + offX + col * scale, (offY + row * scale + dy) * W + offX + (col + 1) * scale)
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128)
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma, chroma])
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]))
}

test("pairs by scanning the QR code with the camera", async ({ browserName, baseURL }, testInfo) => {
  test.skip(browserName !== "chromium", "fake camera input is a Chromium feature")
  const file = path.join(os.tmpdir(), `oc-remote-qr-${testInfo.workerIndex}-${Date.now()}.y4m`)
  qrVideo(await qrPayload(), file)
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`],
  })
  try {
    const context = await browser.newContext({ ...testInfo.project.use, baseURL, permissions: ["camera"], serviceWorkers: "block" })
    const page = await context.newPage()
    await page.goto("/")
    await page.getByRole("button", { name: "Scan the QR code" }).click()
    await expect(page.locator(".scanner video")).toBeVisible()
    await expect(page.getByLabel("Message")).toBeVisible()
    await expect(page.getByRole("button", { name: /Connection: Live/ }).first()).toBeVisible()
  } finally {
    await browser.close()
    fs.rmSync(file, { force: true })
  }
})
