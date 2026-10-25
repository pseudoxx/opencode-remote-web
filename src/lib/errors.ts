import { t, type MessageKey, type Params } from "../i18n"

// An error raised by the app itself; its text follows the UI language.
export class AppError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly params: Params = {},
  ) {
    super(key)
  }

  get text() {
    return t(this.key, this.params)
  }
}
