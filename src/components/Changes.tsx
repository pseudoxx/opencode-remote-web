import { useEffect, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Sheet, Spinner } from "./ui"
import { backend } from "../state/store"
import { describeError } from "../lib/connect"
import type { FileDiff } from "../lib/types"
import { t, type MessageKey } from "../i18n"

export type ChangesTarget = { sessionID: string; from?: string; to?: string; title: MessageKey }

function PatchView({ patch }: { patch: string }) {
  const lines = patch.split("\n").filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode)/.test(l))
  return (
    <pre class="diff patch">
      {lines.map((line, i) => (
        <div key={i} class={line.startsWith("@@") ? "hunk" : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : ""}>
          {line || " "}
        </div>
      ))}
    </pre>
  )
}

export function ChangesSheet({ target, onClose }: { target?: ChangesTarget; onClose: () => void }) {
  const [files, setFiles] = useState<FileDiff[]>()
  const [error, setError] = useState<string>()
  const [open, setOpen] = useState<string>()

  useEffect(() => {
    if (!target) return
    setFiles(undefined)
    setError(undefined)
    setOpen(undefined)
    backend.value
      ?.diff(target.sessionID, { from: target.from, to: target.to })
      .then((list) => {
        setFiles(list)
        if (list.length === 1) setOpen(list[0].file)
      })
      .catch((e) => setError(describeError(e)))
  }, [target])

  const totals = files?.reduce((acc, f) => ({ add: acc.add + f.additions, del: acc.del + f.deletions }), { add: 0, del: 0 })

  return (
    <Sheet open={!!target} onClose={onClose} title={target ? t(target.title) : t("changes.title")} wide>
      {!files && !error && (
        <div class="empty">
          <Spinner /> {t("changes.loading")}
        </div>
      )}
      {error && <p class="note error small">{error}</p>}
      {files && !files.length && <p class="empty muted small">{t("changes.none")}</p>}
      {files && files.length > 0 && (
        <>
          <p class="muted small">
            {t("changes.files", { count: files.length })} · <span class="add-text">+{totals?.add}</span>{" "}
            <span class="del-text">−{totals?.del}</span>
          </p>
          <ul class="changes">
            {files.map((f) => (
              <li key={f.file}>
                <button class="change-head" onClick={() => setOpen(open === f.file ? undefined : f.file)} aria-expanded={open === f.file}>
                  <span class={`file-status ${f.status}`}>{f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M"}</span>
                  <span class="mono ellipsis grow">{f.file}</span>
                  <span class="add-text small">+{f.additions}</span>
                  <span class="del-text small">−{f.deletions}</span>
                  <Icon name={open === f.file ? "chevronDown" : "chevronRight"} size={14} />
                </button>
                {open === f.file && (f.patch ? <PatchView patch={f.patch} /> : <p class="muted small">{t("changes.noPatch")}</p>)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  )
}
