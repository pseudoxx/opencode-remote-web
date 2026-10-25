import { Icon } from "./Icon"
import { LOCALES, detectLocale, languageChoice, setLanguage, t, type Locale } from "../i18n"

// "System" follows the browser's language setting; each language is listed in its own script.
export function LanguageSelect({ compact }: { compact?: boolean }) {
  const system = detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
  const systemLabel = LOCALES.find((l) => l.id === system)?.label ?? system
  return (
    <label class={`language-select${compact ? " compact" : ""}`}>
      {compact ? <Icon name="globe" size={16} /> : <span>{t("common.language")}</span>}
      <select
        aria-label={t("common.language")}
        value={languageChoice.value}
        onChange={(e) => setLanguage(e.currentTarget.value as Locale | "auto")}
      >
        <option value="auto">{t("settings.languageSystem", { language: systemLabel })}</option>
        {LOCALES.map((l) => (
          <option key={l.id} value={l.id} lang={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
