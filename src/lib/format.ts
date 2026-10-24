export function basename(path: string) {
  const trimmed = path.replace(/[\\/]+$/, "")
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  return i === -1 ? trimmed || path : trimmed.slice(i + 1) || trimmed
}

export function dirname(path: string) {
  const trimmed = path.replace(/[\\/]+$/, "")
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  if (i <= 0) return trimmed.startsWith("/") ? "/" : trimmed
  return trimmed.slice(0, i)
}

export function joinPath(dir: string, rel: string) {
  if (!rel || rel === ".") return dir
  if (rel.startsWith("/")) return rel
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/"
  return dir.replace(/[\\/]+$/, "") + sep + rel.replace(/^[\\/]+/, "")
}

export function shortPath(path: string, home?: string) {
  if (home && path.startsWith(home)) return "~" + path.slice(home.length)
  return path
}

export function relativeTime(ms: number, now = Date.now()) {
  const s = Math.round((now - ms) / 1000)
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function clockTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export function compactNumber(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function money(usd: number) {
  if (!usd) return "$0"
  if (usd < 0.01) return "<$0.01"
  return `$${usd.toFixed(2)}`
}

export function slug(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "session"
  )
}
