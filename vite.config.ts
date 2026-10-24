import { defineConfig, type Plugin } from "vite"
import preact from "@preact/preset-vite"
import pkg from "./package.json" with { type: "json" }

// The page holds credentials for a machine that runs shell commands, so the production build ships a strict
// Content Security Policy: no inline or third-party scripts, and no remote images (which could be used to leak data
// out of rendered model output). connect-src stays open because the server address is chosen by the user.
// Dev mode skips it because Vite's HMR client relies on inline scripts.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src * data: blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ")

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    },
  }
}

// `base: "./"` keeps the build portable: it works at a domain root or under a sub-path such as
// GitHub Pages project sites (https://user.github.io/repo/).
export default defineConfig({
  base: "./",
  plugins: [preact(), contentSecurityPolicy()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: ["es2022", "safari16", "chrome111", "firefox115"],
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
})
