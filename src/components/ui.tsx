import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { toasts } from "../state/store"
import { copyText } from "../lib/export"
import { t } from "../i18n"

// A native <dialog>: focus trapping, Escape and the backdrop come for free in every current browser. Styled as a
// bottom sheet on phones and a centered panel on larger screens.
export function Sheet(props: {
  open: boolean
  onClose: () => void
  title?: ComponentChildren
  children: ComponentChildren
  wide?: boolean
  class?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (props.open && !d.open) {
      try {
        d.showModal()
      } catch {
        d.setAttribute("open", "")
      }
    }
    if (!props.open && d.open) d.close()
  }, [props.open])
  return (
    <dialog
      ref={ref}
      class={`sheet${props.wide ? " wide" : ""}${props.class ? ` ${props.class}` : ""}`}
      onClose={() => props.open && props.onClose()}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose()
      }}
    >
      {props.open && (
        <div class="sheet-body">
          {props.title !== undefined && (
            <header class="sheet-head">
              <h2>{props.title}</h2>
              <button class="icon-btn" onClick={props.onClose} aria-label={t("common.close")}>
                <Icon name="x" />
              </button>
            </header>
          )}
          {props.children}
        </div>
      )}
    </dialog>
  )
}

export type MenuItem = { label: string; icon?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }

export function Menu(props: { open: boolean; onClose: () => void; title?: string; items: (MenuItem | false | undefined)[] }) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title} class="menu-sheet">
      <ul class="menu" role="menu">
        {props.items
          .filter((i): i is MenuItem => !!i)
          .map((item) => (
            <li key={item.label}>
              <button
                role="menuitem"
                class={item.danger ? "danger" : ""}
                disabled={item.disabled}
                onClick={() => {
                  props.onClose()
                  item.onSelect()
                }}
              >
                {item.icon && <Icon name={item.icon} />}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
      </ul>
    </Sheet>
  )
}

export function TextPrompt(props: {
  open: boolean
  title: string
  label: string
  initial?: string
  confirm?: string
  onClose: () => void
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(props.initial ?? "")
  useEffect(() => {
    if (props.open) setValue(props.initial ?? "")
  }, [props.open, props.initial])
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title}>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!value.trim()) return
          props.onClose()
          props.onSubmit(value.trim())
        }}
      >
        <label class="field">
          <span>{props.label}</span>
          <input autoFocus value={value} onInput={(e) => setValue(e.currentTarget.value)} />
        </label>
        <div class="row end">
          <button type="button" class="btn ghost" onClick={props.onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" class="btn primary">
            {props.confirm ?? t("common.save")}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span class="spinner" style={{ width: `${size}px`, height: `${size}px` }} aria-label={t("common.loadingLabel")} />
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function CopyButton({ text, label: labelProp, onCopy }: { text: () => string; label?: string; onCopy: (text: string) => Promise<boolean> }) {
  const [done, setDone] = useState(false)
  const label = labelProp ?? t("common.copy")
  return (
    <button
      class="icon-btn small"
      title={label}
      aria-label={label}
      onClick={async () => {
        if (await onCopy(text())) {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} size={15} />
    </button>
  )
}

export function Cmd({ text }: { text: string }) {
  return (
    <div class="cmd">
      <code>{text}</code>
      <CopyButton text={() => text} onCopy={copyText} label={t("common.copyCommand")} />
    </div>
  )
}
