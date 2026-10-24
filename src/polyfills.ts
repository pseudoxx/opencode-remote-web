// The OpenCode client uses a couple of APIs that only landed in Safari 17.4 / Chrome 116. These small shims keep
// iOS 16 and older iPads working.

if (typeof (Promise as { withResolvers?: unknown }).withResolvers !== "function") {
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value: function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    },
  })
}

if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any !== "function") {
  Object.defineProperty(AbortSignal, "any", {
    configurable: true,
    writable: true,
    value: function any(signals: AbortSignal[]) {
      const controller = new AbortController()
      for (const signal of signals) {
        if (signal.aborted) {
          controller.abort(signal.reason)
          break
        }
        signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true, signal: controller.signal })
      }
      return controller.signal
    },
  })
}

if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "function") {
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    writable: true,
    value: function timeout(ms: number) {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms)
      return controller.signal
    },
  })
}
