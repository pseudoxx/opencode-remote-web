import { useEffect, useRef, useState } from "preact/hooks"
import { Icon } from "./Icon"

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> }

function nativeDetector(): Detector | undefined {
  const Ctor = (globalThis as { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }).BarcodeDetector
  if (!Ctor) return
  try {
    return new Ctor({ formats: ["qr_code"] })
  } catch {
    return
  }
}

// jsQR (~45 KB gzipped) is only needed where BarcodeDetector is missing (Safari, Firefox), so it loads on demand.
type JsQR = typeof import("jsqr").default
let jsQRPromise: Promise<JsQR> | undefined
function loadJsQR() {
  jsQRPromise ??= import("jsqr").then((m) => m.default)
  return jsQRPromise
}

async function decodeCanvas(canvas: HTMLCanvasElement) {
  const jsQR = await loadJsQR()
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" })?.data
}

// Decodes a QR code from a photo or screenshot (fallback when live camera access is unavailable).
export async function decodeImageFile(file: File): Promise<string | undefined> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const detector = nativeDetector()
    if (detector) {
      const found = await detector.detect(img).catch(() => [])
      if (found[0]?.rawValue) return found[0].rawValue
    }
    for (const max of [1600, 900, 2400]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
      const text = await decodeCanvas(canvas)
      if (text) return text
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string>()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream: MediaStream | undefined
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const canvas = document.createElement("canvas")
    const detector = nativeDetector()
    if (!detector) loadJsQR()

    async function start() {
      if (!window.isSecureContext) return setError("The camera needs an HTTPS page. Paste the link instead.")
      if (!navigator.mediaDevices?.getUserMedia) return setError("This browser has no camera access. Paste the link instead.")
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (e) {
        const name = (e as DOMException).name
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow it in your browser settings, or scan from a photo."
            : name === "NotFoundError"
              ? "No camera found. Scan from a photo or paste the link."
              : `Could not start the camera (${name}).`,
        )
        return
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop())
      const v = video.current
      if (!v) return
      v.srcObject = stream
      await v.play().catch(() => {})
      setReady(true)
      scan()
    }

    async function scan() {
      if (stopped) return
      const v = video.current
      if (v && v.readyState >= 2 && v.videoWidth) {
        let text: string | undefined
        if (detector) {
          const found = await detector.detect(v).catch(() => [])
          text = found[0]?.rawValue
        } else {
          const scale = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight))
          canvas.width = Math.round(v.videoWidth * scale)
          canvas.height = Math.round(v.videoHeight * scale)
          canvas.getContext("2d", { willReadFrequently: true })?.drawImage(v, 0, 0, canvas.width, canvas.height)
          text = await decodeCanvas(canvas)
        }
        if (text && !stopped) {
          stopped = true
          navigator.vibrate?.(30)
          onResult(text)
          return
        }
      }
      timer = setTimeout(scan, 150)
    }

    start()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div class="scanner">
      <video ref={video} playsInline muted autoPlay />
      {ready && <div class="scanner-frame" aria-hidden="true" />}
      {!ready && !error && <div class="scanner-msg">Starting camera…</div>}
      {error && (
        <div class="scanner-msg error">
          <Icon name="alert" /> {error}
        </div>
      )}
      <button class="btn small scanner-close" onClick={onClose}>
        <Icon name="x" size={16} /> Close camera
      </button>
    </div>
  )
}
