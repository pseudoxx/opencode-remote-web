// Translations for the whole UI. English (en.ts) is the source of truth; every other locale must provide exactly the
// same keys, which the type checker enforces. The language follows the system setting unless the user picks one.
import { computed, effect, signal } from "@preact/signals"
import type { ComponentChildren } from "preact"
import { en } from "./locales/en"
import { ja } from "./locales/ja"
import { zhCN } from "./locales/zh-CN"
import { zhTW } from "./locales/zh-TW"
import { es } from "./locales/es"
import { fr } from "./locales/fr"
import { ko } from "./locales/ko"

export type Params = Record<string, string | number>
export type Message = string | ((p: Params) => string)
export type MessageKey = keyof typeof en
export type Messages = { readonly [K in MessageKey]: Message }

export type Locale = "en" | "ja" | "zh-CN" | "zh-TW" | "es" | "fr" | "ko"

// Each language is listed under its own name, so it can be found whatever the current language is.
export const LOCALES: ReadonlyArray<{ id: Locale; label: string }> = [
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "zh-CN", label: "简体中文" },
  { id: "zh-TW", label: "繁體中文" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "ko", label: "한국어" },
]

const catalogs: Record<Locale, Messages> = { en, ja, "zh-CN": zhCN, "zh-TW": zhTW, es, fr, ko }

// Maps the browser's preferred languages to a supported locale. Traditional Chinese covers zh-TW/HK/MO and any
// zh-Hant tag; other Chinese tags get Simplified.
export function detectLocale(languages: readonly string[]): Locale {
  for (const raw of languages) {
    const tag = raw.toLowerCase()
    if (tag.startsWith("zh")) return /hant|-tw|-hk|-mo/.test(tag) ? "zh-TW" : "zh-CN"
    const base = tag.split("-")[0]
    const match = LOCALES.find((l) => l.id === base)
    if (match) return match.id
  }
  return "en"
}

const PREF_KEY = "ocr:language"

function storedChoice(): Locale | "auto" {
  try {
    const value = localStorage.getItem(PREF_KEY)
    return value && (value === "auto" || value in catalogs) ? (value as Locale | "auto") : "auto"
  } catch {
    return "auto"
  }
}

const systemLanguages = () => (typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language])

export const languageChoice = signal<Locale | "auto">(storedChoice())
const systemLocale = signal<Locale>(detectLocale(systemLanguages()))
export const locale = computed<Locale>(() => (languageChoice.value === "auto" ? systemLocale.value : languageChoice.value))

export function setLanguage(choice: Locale | "auto") {
  languageChoice.value = choice
  try {
    if (choice === "auto") localStorage.removeItem(PREF_KEY)
    else localStorage.setItem(PREF_KEY, choice)
  } catch {}
}

if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => (systemLocale.value = detectLocale(systemLanguages())))
  effect(() => {
    document.documentElement.lang = locale.value
  })
}

function format(template: string, params?: Params) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

export function t(key: MessageKey, params?: Params): string {
  const message = catalogs[locale.value][key] ?? en[key]
  return typeof message === "function" ? message(params ?? {}) : format(message, params)
}

// For messages with markup: {name} placeholders are filled with elements, e.g.
// rich("connect.scanHint", { command: <code>opencode pair</code> }).
export function rich(key: MessageKey, parts: Record<string, ComponentChildren>, params?: Params): ComponentChildren[] {
  const text = t(key, params)
  const out: ComponentChildren[] = []
  let last = 0
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    const index = match.index ?? 0
    if (!(match[1] in parts)) continue
    if (index > last) out.push(text.slice(last, index))
    out.push(parts[match[1]])
    last = index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// English and similar languages need singular/plural forms; CJK messages just ignore this.
export function plural(count: number, one: string, other: string) {
  return (count === 1 ? one : other).replace("{count}", String(count))
}
