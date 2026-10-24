// Starts a throwaway lab for the end-to-end tests: the mock LLM plus a real OpenCode v2 server
// (`opencode serve`) with its own data/config directories and two git projects. Nothing touches your real
// OpenCode setup. Point OPENCODE_BIN at an OpenCode 2.x binary if `opencode` on PATH is not 2.x.
import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 4655)
export const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 4700)
export const PASSWORD = "e2e-password"
export const V1_PORT = Number(process.env.E2E_V1_PORT ?? 4710)

async function waitFor(check: () => Promise<boolean>, what: string, ms = 60_000) {
  const end = Date.now() + ms
  let last = "no attempt"
  while (Date.now() < end) {
    try {
      if (await check()) return
      last = "check returned false"
    } catch (error) {
      last = String((error as { cause?: { code?: string } }).cause?.code ?? error)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Timed out waiting for ${what} (last: ${last})`)
}

// A server left over from an earlier run would silently answer in place of the fresh one.
async function assertPortFree(port: number) {
  const inUse = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) }).then(
    () => true,
    (error) => (error as { cause?: { code?: string } }).cause?.code !== "ECONNREFUSED",
  )
  if (inUse) throw new Error(`Port ${port} is already in use (a server left over from an earlier run?). Stop it and retry.`)
}

function git(cwd: string, ...args: string[]) {
  execFileSync("git", ["-c", "user.email=e2e@example.com", "-c", "user.name=e2e", ...args], { cwd, stdio: "ignore" })
}

function makeProject(dir: string, readme: string) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "README.md"), readme)
  git(dir, "init", "-q")
  git(dir, "add", "-A")
  git(dir, "commit", "-qm", "init")
}

export default async function globalSetup() {
  const bin = process.env.OPENCODE_BIN || "opencode"
  let version = ""
  try {
    version = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim()
  } catch {
    throw new Error(`Could not run "${bin}". Install @opencode/cli 2.x or set OPENCODE_BIN.`)
  }
  if (!/(^|[^\d.])2\.\d+/.test(version)) throw new Error(`The e2e tests need OpenCode 2.x, found "${version}". Set OPENCODE_BIN.`)

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oc-remote-e2e-"))
  const xdg = {
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
    XDG_CACHE_HOME: path.join(root, "cache"),
  }
  const alpha = path.join(root, "projects", "alpha")
  const beta = path.join(root, "projects", "beta")
  makeProject(alpha, "# alpha\n")
  makeProject(beta, "# beta\n")

  fs.mkdirSync(path.join(xdg.XDG_CONFIG_HOME, "opencode"), { recursive: true })
  fs.writeFileSync(
    path.join(xdg.XDG_CONFIG_HOME, "opencode", "opencode.jsonc"),
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        model: "mock/mock-fast",
        providers: {
          mock: {
            name: "Mock LLM",
            env: ["MOCK_API_KEY"],
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: `http://127.0.0.1:${MOCK_PORT}/v1` },
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

  for (const port of [MOCK_PORT, SERVER_PORT, ...(process.env.OPENCODE_V1_BIN ? [V1_PORT] : [])]) await assertPortFree(port)

  const children: ChildProcess[] = []
  // The opencode launchers start the real binary as a child; each server gets its own process group so the
  // whole tree is stopped.
  const teardown = async () => {
    for (const child of children) {
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM")
      } catch {
        child.kill()
      }
    }
    await new Promise((r) => setTimeout(r, 500))
    if (!process.env.E2E_KEEP) fs.rmSync(root, { recursive: true, force: true })
  }
  try {
  const logs = fs.openSync(path.join(root, "lab.log"), "a")
  const mock = spawn(process.execPath, [path.join(here, "..", "dev", "mock-llm.mjs")], {
    env: { ...process.env, MOCK_LLM_PORT: String(MOCK_PORT) },
    stdio: ["ignore", logs, logs],
    detached: true,
  })
  children.push(mock)
  const server = spawn(bin, ["serve", "--hostname", "127.0.0.1", "--port", String(SERVER_PORT)], {
    cwd: alpha,
    env: { ...process.env, ...xdg, MOCK_API_KEY: "mock", OPENCODE_SERVER_PASSWORD: PASSWORD },
    stdio: ["ignore", logs, logs],
    detached: true,
  })
  children.push(server)

  const url = `http://127.0.0.1:${SERVER_PORT}`
  const auth = "Basic " + Buffer.from(`opencode:${PASSWORD}`).toString("base64")
  await waitFor(async () => (await fetch(`http://127.0.0.1:${MOCK_PORT}/v1/models`)).ok, "mock LLM")
  await waitFor(async () => (await fetch(`${url}/api/info`, { headers: { authorization: auth } })).ok, "OpenCode server")

  // Register both folders as projects so the project picker lists them.
  const headers = { authorization: auth, "content-type": "application/json" }
  let seed = ""
  for (const directory of [beta, alpha]) {
    const res = await fetch(`${url}/api/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: `Seed ${path.basename(directory)}`, location: { directory } }),
    })
    if (!res.ok) throw new Error(`Seeding ${directory} failed: ${res.status} ${await res.text()}`)
    seed = ((await res.json()) as { data: { id: string } }).data.id
  }
  // OpenCode does a lot of one-time work (model catalog, instance boot) on first use; get it out of the way so the
  // first tests do not stall behind it.
  for (const directory of [alpha, beta]) await fetch(`${url}/api/model?location[directory]=${encodeURIComponent(directory)}`, { headers })
  await fetch(`${url}/api/session/${seed}/prompt`, { method: "POST", headers, body: JSON.stringify({ text: "warm up" }) })
  await waitFor(async () => {
    const res = await fetch(`${url}/api/session/${seed}/message?limit=5`, { headers })
    const body = (await res.json()) as { data: Array<{ type: string }> }
    return body.data.some((m) => m.type === "idle")
  }, "warm-up prompt", 90_000)

  // Optional: an OpenCode 1.x server (opencode-ai package) for tests/v1.spec.ts. Set OPENCODE_V1_BIN to enable.
  const v1 = process.env.OPENCODE_V1_BIN
  if (v1) {
    const v1root = path.join(root, "v1")
    const v1xdg = {
      XDG_DATA_HOME: path.join(v1root, "data"),
      XDG_CONFIG_HOME: path.join(v1root, "config"),
      XDG_STATE_HOME: path.join(v1root, "state"),
      XDG_CACHE_HOME: path.join(v1root, "cache"),
    }
    const gamma = path.join(root, "projects", "gamma")
    makeProject(gamma, "# gamma\n")
    fs.mkdirSync(path.join(v1xdg.XDG_CONFIG_HOME, "opencode"), { recursive: true })
    fs.writeFileSync(
      path.join(v1xdg.XDG_CONFIG_HOME, "opencode", "opencode.json"),
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        model: "mock/mock-fast",
        provider: {
          mock: {
            npm: "@ai-sdk/openai-compatible",
            name: "Mock LLM",
            options: { baseURL: `http://127.0.0.1:${MOCK_PORT}/v1`, apiKey: "mock" },
            models: { "mock-fast": { name: "Mock Fast" }, "mock-smart": { name: "Mock Smart" } },
          },
        },
        permission: { bash: "ask", edit: "ask" },
      }),
    )
    // A clean environment: the test runner's variables (NODE_OPTIONS loaders and the like) leak into 1.x's
    // child processes otherwise.
    const v1server = spawn(v1, ["serve", "--hostname", "127.0.0.1", "--port", String(V1_PORT)], {
      cwd: gamma,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? root, ...v1xdg, OPENCODE_SERVER_PASSWORD: PASSWORD },
      stdio: ["ignore", logs, logs],
      detached: true,
    })
    children.push(v1server)
    const v1url = `http://127.0.0.1:${V1_PORT}`
    await waitFor(async () => {
      const res = await fetch(`${v1url}/global/health`, { headers: { authorization: auth }, signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return true
    }, "OpenCode 1.x server", 240_000)
    const seeded = await fetch(`${v1url}/session?directory=${encodeURIComponent(gamma)}`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ title: "Seed gamma" }),
    })
    if (!seeded.ok) throw new Error(`Seeding the 1.x server failed: ${seeded.status}`)
    // The first prompt makes 1.x install the provider package; do it here so tests do not pay for it.
    const sid = ((await seeded.json()) as { id: string }).id
    const warm = await fetch(`${v1url}/session/${sid}/message?directory=${encodeURIComponent(gamma)}`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "warm up" }] }),
    })
    if (!warm.ok) console.warn(`1.x warm-up prompt failed: ${warm.status} ${await warm.text()}`)
    const q = `directory=${encodeURIComponent(gamma)}`
    for (const route of [`/config/providers?${q}`, `/agent?${q}`, `/command?${q}`, `/project`, `/session/status?${q}`, `/permission?${q}`, `/question?${q}`])
      await fetch(v1url + route, { headers: { authorization: auth } })
    Object.assign(process.env, { E2E_V1_SERVER: v1url, E2E_GAMMA: gamma })
  }

  Object.assign(process.env, {
    E2E_SERVER: url,
    E2E_PASSWORD: PASSWORD,
    E2E_ALPHA: alpha,
    E2E_BETA: beta,
    E2E_ROOT: root,
    E2E_OPENCODE_VERSION: version,
  })

  } catch (error) {
    // A failed setup gets no teardown call, so stop the servers here instead of leaving them running.
    console.error(`Lab setup failed; server logs are in ${path.join(root, "lab.log")}`)
    process.env.E2E_KEEP = "1"
    await teardown()
    throw error
  }
  return teardown
}
