#!/usr/bin/env node
// Mock OpenAI-compatible LLM for exercising OpenCode without a real provider.
//
// The reply depends on the last user message:
//   shell: <command>          -> calls the shell/bash tool
//   write: <path>\n<content>  -> calls the write tool
//   ask: <question>           -> calls the question tool (Red / Blue)
//   think                     -> streams reasoning, then a short answer
//   xss                       -> replies with hostile HTML/markdown (sanitizer test)
//   slow                      -> streams for ~20s (for testing abort)
//   anything else             -> streams a markdown reply that echoes the prompt
// After a tool result comes back it answers with a short summary.

import http from "node:http"
import fs from "node:fs"

const port = Number(process.env.MOCK_LLM_PORT ?? 4555)
const dumpDir = process.env.MOCK_LLM_DUMP

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function textOf(content) {
  if (typeof content === "string") return content
  if (Array.isArray(content))
    return content
      .map((part) => (typeof part === "string" ? part : (part.text ?? part.content ?? "")))
      .filter(Boolean)
      .join("\n")
  return ""
}

function findTool(tools, names) {
  for (const name of names) {
    const tool = tools.find((t) => (t.function?.name ?? t.name) === name)
    if (tool) return tool.function ?? tool
  }
}

function argsFor(tool, values) {
  const props = tool.parameters?.properties ?? {}
  const out = {}
  for (const [key, value] of Object.entries(values)) {
    const match = value.keys.find((k) => k in props)
    if (match) out[match] = value.value
  }
  for (const key of tool.parameters?.required ?? []) {
    if (!(key in out)) out[key] = key.toLowerCase().includes("desc") ? "Run a command requested by the user" : ""
  }
  return out
}

function plan(body) {
  const messages = body.messages ?? []
  const tools = body.tools ?? []
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => textOf(m.content))
    .join("\n")
  const last = messages[messages.length - 1]

  if (!tools.length && /title/i.test(system)) return { text: "Mock session title" }

  if (last?.role === "tool") {
    const result = textOf(last.content).slice(0, 300)
    return { text: `Tool finished. Output:\n\n\`\`\`\n${result}\n\`\`\`\n\nAnything else?` }
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  const prompt = textOf(lastUser?.content).trim()

  const shell = /^shell:\s*(.+)$/is.exec(prompt)
  if (shell) {
    const tool = findTool(tools, ["shell", "bash"])
    if (tool)
      return {
        tool: tool.name,
        args: argsFor(tool, {
          command: { keys: ["command", "cmd"], value: shell[1].trim() },
          description: { keys: ["description"], value: "Run a command requested by the user" },
        }),
      }
  }

  const write = /^write:\s*(\S+)\s*\n([\s\S]*)$/i.exec(prompt)
  if (write) {
    const tool = findTool(tools, ["write", "edit"])
    if (tool)
      return {
        tool: tool.name,
        args: argsFor(tool, {
          path: { keys: ["filePath", "path", "file"], value: write[1] },
          content: { keys: ["content", "text"], value: write[2] },
        }),
      }
  }

  const ask = /^ask:\s*(.+)$/is.exec(prompt)
  if (ask) {
    const tool = findTool(tools, ["question"])
    if (tool)
      return {
        tool: tool.name,
        args: {
          questions: [
            {
              question: ask[1].trim(),
              header: "Pick one",
              options: [
                { label: "Red", description: "The warm option" },
                { label: "Blue", description: "The cool option" },
              ],
            },
          ],
        },
      }
  }

  if (/^xss\b/i.test(prompt))
    return {
      text: [
        "Untrusted output test.",
        "",
        '<img src="x" onerror="window.__xss = 1">',
        "<script>window.__xss = 2</script>",
        "[click me](javascript:window.__xss=3)",
        "![remote](https://example.com/track.png)",
        '<a href="https://example.com" onclick="window.__xss=4">safe link</a>',
      ].join("\n\n"),
    }

  if (/^think\b/i.test(prompt))
    return { reasoning: "Let me think about this step by step. First... then... ", text: "Thought about it. **Done.**" }

  if (/^slow\b/i.test(prompt)) return { text: "Working slowly. ".repeat(40), delay: 500 }

  const model = body.model ?? "mock"
  return {
    text: [
      `You said: **${prompt.slice(0, 200) || "(nothing)"}**`,
      "",
      `I'm the mock model \`${model}\`. Here is some sample markdown:`,
      "",
      "- item one",
      "- item two",
      "",
      "```ts",
      "const answer = 42",
      "```",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n"),
  }
}

function chunk(id, model, delta, finish = null, extra = {}) {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...extra,
  })}\n\n`
}

async function stream(res, body, step) {
  const id = `chatcmpl-${Math.random().toString(36).slice(2)}`
  const model = body.model ?? "mock"
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
  res.write(chunk(id, model, { role: "assistant", content: "" }))
  const usage = { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 }

  if (step.tool) {
    const args = JSON.stringify(step.args)
    res.write(
      chunk(id, model, {
        tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: "function", function: { name: step.tool, arguments: "" } }],
      }),
    )
    for (let i = 0; i < args.length; i += 16) {
      res.write(chunk(id, model, { tool_calls: [{ index: 0, function: { arguments: args.slice(i, i + 16) } }] }))
      await sleep(10)
    }
    res.write(chunk(id, model, {}, "tool_calls", { usage }))
  } else {
    for (const word of (step.reasoning ?? "").split(/(?<=\s)/).filter(Boolean)) {
      res.write(chunk(id, model, { reasoning_content: word }))
      await sleep(15)
    }
    const words = step.text.split(/(?<=\s)/)
    for (const word of words) {
      if (res.destroyed) return
      res.write(chunk(id, model, { content: word }))
      await sleep(step.delay ?? 15)
    }
    res.write(chunk(id, model, {}, "stop", { usage }))
  }
  res.write("data: [DONE]\n\n")
  res.end()
}

let requestCount = 0

const server = http.createServer(async (req, res) => {
  let raw = ""
  for await (const piece of req) raw += piece
  const body = raw ? JSON.parse(raw) : {}
  requestCount++

  if (req.method === "GET" && req.url.endsWith("/models")) {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-fast", object: "model" }, { id: "mock-smart", object: "model" }] }))
    return
  }

  if (!req.url.endsWith("/chat/completions")) {
    console.log(`[mock] unhandled ${req.method} ${req.url}`)
    res.writeHead(404, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: { message: `mock does not handle ${req.url}` } }))
    return
  }

  if (dumpDir) fs.writeFileSync(`${dumpDir}/request-${requestCount}.json`, JSON.stringify(body, null, 2))
  const step = plan(body)
  console.log(
    `[mock] #${requestCount} model=${body.model} tools=${(body.tools ?? []).length} -> ${step.tool ? `tool ${step.tool}` : "text"}`,
  )

  if (body.stream === false) {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(
      JSON.stringify({
        id: "chatcmpl-mock",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content: step.text ?? "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    )
    return
  }
  await stream(res, body, step)
})

server.listen(port, "127.0.0.1", () => console.log(`[mock] listening on http://127.0.0.1:${port}/v1`))
