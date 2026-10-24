import { Marked } from "marked"
import DOMPurify from "dompurify"

// Model output can quote files or web pages the agent read, so it is untrusted: a prompt-injected <img onerror>
// or <script> must never run in a page that holds the server credentials. Markdown is rendered with marked and
// then sanitized; remote images are also blocked by the CSP (img-src 'self' data: blob:).

const marked = new Marked({ gfm: true, breaks: false, async: false })

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? ""
    if (!/^(https?:|mailto:|#)/i.test(href)) node.removeAttribute("href")
    node.setAttribute("target", "_blank")
    node.setAttribute("rel", "noopener noreferrer nofollow")
  }
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? ""
    if (!/^data:image\//i.test(src)) {
      node.setAttribute("data-blocked-src", src)
      node.removeAttribute("src")
      node.setAttribute("alt", `[image blocked: ${node.getAttribute("alt") || src}]`)
    }
  }
})

const PURIFY = {
  ALLOWED_TAGS: [
    "a", "b", "blockquote", "br", "code", "del", "details", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
    "i", "img", "input", "kbd", "li", "ol", "p", "pre", "s", "span", "strong", "sub", "summary", "sup", "table",
    "tbody", "td", "th", "thead", "tr", "ul",
  ],
  ALLOWED_ATTR: ["href", "title", "alt", "src", "class", "type", "checked", "disabled", "align", "colspan", "rowspan", "start", "data-blocked-src"],
  ALLOW_DATA_ATTR: false,
}

const cache = new Map<string, string>()

// Streaming text changes on every delta, so only finished text is cached.
export function renderMarkdown(text: string, stable = true): string {
  const hit = cache.get(text)
  if (hit !== undefined) return hit
  const html = DOMPurify.sanitize(marked.parse(text) as string, PURIFY) as string
  if (!stable) return html
  if (cache.size > 400) cache.delete(cache.keys().next().value as string)
  cache.set(text, html)
  return html
}
