// Renders the PNG app icons from public/icon*.svg with headless Chromium: node dev/icons.mjs
import { chromium } from "@playwright/test"
import fs from "node:fs"

const out = new URL("../public/", import.meta.url)
const browser = await chromium.launch()
const page = await browser.newPage()
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["icon-maskable.svg", "icon-maskable-512.png", 512],
  ["icon-maskable.svg", "apple-touch-icon.png", 180],
]
for (const [src, dest, size] of jobs) {
  const svg = fs.readFileSync(new URL(src, out), "utf8")
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: new URL(dest, out).pathname, omitBackground: true })
  console.log("wrote", dest)
}
await browser.close()
