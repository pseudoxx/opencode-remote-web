#!/usr/bin/env node
// Local playground: the mock LLM plus a throwaway OpenCode v2 server, then prints a pairing link.
//   npm run lab              (uses `opencode` on PATH, must be 2.x)
//   OPENCODE_BIN=... npm run lab
// Then run `npm run dev` and open http://localhost:5173/#pair=<link> (printed below). Ctrl+C stops everything.
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const bin = process.env.OPENCODE_BIN || "opencode"
const mockPort = Number(process.env.MOCK_LLM_PORT ?? 4555)
const port = Number(process.env.LAB_PORT ?? 4096)
const password = process.env.LAB_PASSWORD ?? "lab"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "oc-remote-lab-"))
const project = path.join(root, "project")
fs.mkdirSync(project, { recursive: true })
fs.writeFileSync(path.join(project, "README.md"), "# lab project\n")
for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.email=lab@example.com", "-c", "user.name=lab", "commit", "-qm", "init"]])
  execFileSync("git", args, { cwd: project, stdio: "ignore" })

const xdg = {
  XDG_DATA_HOME: path.join(root, "data"),
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_STATE_HOME: path.join(root, "state"),
  XDG_CACHE_HOME: path.join(root, "cache"),
}
fs.mkdirSync(path.join(xdg.XDG_CONFIG_HOME, "opencode"), { recursive: true })
fs.writeFileSync(
  path.join(xdg.XDG_CONFIG_HOME, "opencode", "opencode.jsonc"),
  JSON.stringify(
    {
      model: "mock/mock-fast",
      providers: {
        mock: {
          name: "Mock LLM",
          env: ["MOCK_API_KEY"],
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `http://127.0.0.1:${mockPort}/v1` },
          models: {
            "mock-fast": { name: "Mock Fast", compatibility: { reasoningField: "reasoning_content" } },
            "mock-smart": { name: "Mock Smart", compatibility: { reasoningField: "reasoning_content" } },
          },
        },
      },
      permissions: [
        { action: "shell", resource: "*", effect: "ask" },
        { action: "edit", resource: "*", effect: "ask" },
      ],
    },
    null,
    2,
  ),
)

// Own process groups, so stopping also stops the real binary the opencode launcher starts.
const children = [
  spawn(process.execPath, [path.join(here, "mock-llm.mjs")], { env: { ...process.env, MOCK_LLM_PORT: String(mockPort) }, stdio: "inherit", detached: true }),
  spawn(bin, ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: project,
    env: { ...process.env, ...xdg, MOCK_API_KEY: "mock", OPENCODE_SERVER_PASSWORD: password },
    stdio: "inherit",
    detached: true,
  }),
]

function stop() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM")
    } catch {
      c.kill()
    }
  }
  fs.rmSync(root, { recursive: true, force: true })
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)

const url = `http://127.0.0.1:${port}`
const auth = "Basic " + Buffer.from(`opencode:${password}`).toString("base64")
for (let i = 0; i < 120; i++) {
  try {
    const res = await fetch(`${url}/api/pair`, { method: "POST", headers: { authorization: auth } })
    if (res.ok) {
      const { code } = await res.json()
      const link = `${url}/auth/connect/${code}`
      console.log(`\nLab ready. Project folder: ${project}`)
      console.log(`Password login: ${url}  (user opencode, password ${password})`)
      console.log(`Pairing link (5 min, single use): ${link}`)
      console.log(`Open: http://localhost:5173/#pair=${encodeURIComponent(link)}\n`)
      console.log("Prompts the mock understands: shell: <cmd> | write: <path>\\n<content> | ask: <question> | think | slow | xss")
      break
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}
