# OC Remote Web

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **Español** · [Français](README.fr.md) · [한국어](README.ko.md)

<p align="center">
  🚀 <b>Aplicación web en vivo (GitHub Pages):</b> <a href="https://pseudoxx.github.io/opencode-remote-web/"><b>https://pseudoxx.github.io/opencode-remote-web/</b></a>
</p>

Un control remoto para [OpenCode](https://opencode.ai) que funciona por completo en el navegador. Abre la página en
tu teléfono, tableta u otro ordenador, escanea el código QR de `opencode pair` y maneja tus sesiones de OpenCode:
chatea, aprueba comandos, responde a las preguntas del agente, cambia de modelo, revierte turnos, revisa los cambios
y exporta conversaciones.

No hay backend. La página son archivos estáticos que hablan directamente con tu propio servidor de OpenCode, y el
token de emparejamiento se queda en el almacenamiento de tu navegador.

## Funciones

- **Emparejamiento**: escanea el código QR de `opencode pair` con la cámara (o desde una foto), pega un enlace de
  emparejamiento o inicia sesión con una contraseña. Puedes guardar varios servidores; cada uno se recuerda solo en
  este dispositivo o solo durante la pestaña.
- **Proyectos y sesiones**: cambia de proyecto, abre cualquier carpeta del servidor, busca, crea, renombra,
  bifurca y elimina sesiones.
- **Chat**: respuestas en streaming con Markdown, razonamiento plegable y tarjetas de herramientas (salida de la
  shell, diffs de archivos para ediciones y escrituras). Adjunta imágenes y archivos (selector, pegar o arrastrar y
  soltar). `!command` ejecuta un comando de shell y `/` muestra los comandos del servidor.
- **Control del modelo**: elige el agente, el modelo y el esfuerzo de razonamiento de cada sesión.
- **Desbloquear al agente**: las solicitudes de permiso (permitir una vez / siempre / rechazar con una nota) y las
  preguntas del agente aparecen encima del cuadro de texto, con un aviso cuando otra sesión te está esperando.
- **Revertir**: devuelve una sesión al punto anterior a cualquier mensaje, incluidos sus cambios en archivos;
  deshaz la reversión o descarta los mensajes revertidos.
- **Cambios**: mira qué archivos cambió un turno («2 archivos modificados») o el diff de toda la sesión.
- **Copiar y exportar**: copia un mensaje o la conversación entera como Markdown, descárgala en Markdown o JSON, o
  usa el menú de compartir en el teléfono.
- **Salud de la conexión**: estado en vivo con latencia, un vigilante de latidos que reconecta los flujos caídos
  (algo habitual cuando el teléfono entra en reposo o cambia de red) y una prueba de conexión.
- **Funciona en todas partes**: diseños para teléfono, tableta y escritorio; instalable como app (PWA); temas claro
  y oscuro.
- **Tu idioma**: English, 日本語, 简体中文, 繁體中文, Español, Français y 한국어. La app sigue el idioma del sistema;
  puedes cambiarlo en la pantalla de conexión o en Ajustes.
- **OpenCode 2.x y 1.x**: la app de escritorio y `@opencode/cli` 2.x, además de servidores `opencode-ai` 1.x.

## Configuración

### 1. Publica la página (una vez)

Sirve cualquier alojamiento estático. El repositorio incluye un flujo de trabajo para GitHub Pages:

1. Sube este repositorio a GitHub.
2. En los ajustes del repositorio, ve a **Pages** y pon **Source** en **GitHub Actions**.
3. Cada push a `main` compila y publica la app (`.github/workflows/pages.yml`).

Es mejor un alojamiento que le dé a la app **su propio origen**. Todos los sitios de proyecto de GitHub Pages de una
misma cuenta comparten `https://<user>.github.io` y, con él, el almacenamiento del navegador donde vive tu token de
emparejamiento, así que cualquier otra página que publiques ahí podría leerlo. Un dominio propio, o Cloudflare Pages /
Netlify con su propio subdominio, lo evita. Esos dos alojamientos además aplican las cabeceras de seguridad de
`public/_headers`.

También puedes ejecutar `npm run build` y copiar `dist/` donde quieras.

### 2. Permite el origen de la app en tu ordenador (una vez)

Los navegadores solo dejan que una página hable con tu servidor de OpenCode si el servidor permite el origen de la
página (CORS). La app muestra el comando exacto con tu origen ya puesto. Para la app de escritorio o
`@opencode/cli` 2.x (el servicio en segundo plano):

```sh
opencode service set cors https://your-app.example
opencode service restart
```

**¿Solo usas la app de escritorio de OpenCode?** Ejecuta el mismo servicio en segundo plano e incluye la CLI dentro
de la app, así que no necesitas instalar nada. El mensaje de error y la guía de configuración de la app muestran
estos comandos con tu origen ya puesto, para el sistema operativo que detecta (o el que elijas: macOS / Windows /
Linux).

macOS (Terminal), o usa el menú de la app **OpenCode → Instalar CLI...** y luego los comandos de arriba:

```sh
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://your-app.example
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
```

Windows (PowerShell):

```powershell
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://your-app.example"
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
```

Linux (app .deb / .rpm; para la AppImage usa la CLI):

```sh
/opt/OpenCode/resources/opencode-cli service set cors https://your-app.example
/opt/OpenCode/resources/opencode-cli service restart
```

El origen es solo el esquema y el host: `https://you.github.io`, no `https://you.github.io/oc-remote-web/`.
Reiniciar el servicio detiene los agentes en ejecución, así que hazlo cuando no haya nada trabajando. El ajuste se
guarda en `~/.config/opencode/service.json` (`%USERPROFILE%\.config\opencode\service.json` en Windows).

Antes de la primera conexión, la app solo puede adivinar en qué sistema operativo se ejecuta OpenCode, porque el
navegador oculta las respuestas del servidor hasta que CORS las permite. Lo deduce del puerto del servidor (28894 es
el predeterminado en Windows, 49374 en macOS/Linux), de tu última elección o del dispositivo desde el que navegas.
Después de conectarse una vez, lee el sistema operativo de las rutas del servidor y lo recuerda.

Si ya permites otros orígenes, ponlos todos separados por comas. Si en cambio ejecutas un servidor independiente,
usa `opencode serve --cors https://your-app.example`. Para 1.x, usa `opencode serve --cors https://your-app.example`
con `OPENCODE_SERVER_PASSWORD` definida.

### 3. Empareja un dispositivo

```sh
opencode pair --remote
```

En la app de escritorio, usa **Pairing → Pair device** y activa **Remote access**. Escanea el código QR en la app o
pega el enlace impreso (o copiado). `--remote` da una dirección HTTPS a través del túnel de OpenCode que funciona
desde cualquier lugar. Los enlaces de emparejamiento sirven una sola vez y caducan a los 5 minutos; después, el
dispositivo sigue con la sesión iniciada durante 30 días. Para cerrar la sesión en todos los dispositivos, cambia la
contraseña del servidor (`opencode service set password ...`).

Otras formas de llegar a tu servidor:

- **Tailscale o un Cloudflare Tunnel**: pon una dirección HTTPS delante del servidor y ejecuta
  `opencode pair --url https://your-address`.
- **Misma Wi-Fi**: ejecuta `opencode service set hostname 0.0.0.0` y luego `opencode pair`. El código QR contendrá
  entonces direcciones LAN `http://` sin cifrar. Los navegadores las bloquean desde una página `https://`
  («contenido mixto»). Las versiones recientes de Chrome pueden permitirlas después de pedir acceso a la red local
  (la app lo solicita, pero esta vía no está probada); si no, sirve la app por HTTP en tu LAN o usa una de las
  opciones HTTPS anteriores.
- **Contraseña**: en la pestaña Contraseña, introduce la dirección del servidor y la contraseña (servidores 1.x, o
  `opencode serve` con `OPENCODE_SERVER_PASSWORD`).

### Instálala como app

- **iPhone/iPad**: en Safari, toca Compartir y luego Añadir a pantalla de inicio. La app instalada tiene su propio
  almacenamiento, así que vuelve a emparejar dentro de ella.
- **Android**: en Chrome, abre el menú y elige Instalar aplicación (o Añadir a pantalla de inicio).

## Seguridad

La página puede aprobar comandos de shell en tu máquina, así que está hecha a la defensiva:

- **Sin backend.** No se envía nada a ningún sitio salvo a tu propio servidor. No hay analíticas ni peticiones a
  terceros.
- **Las credenciales se quedan en local.** El token de emparejamiento, o la contraseña si usas una, se guarda en el
  almacenamiento de este navegador, o solo en el almacenamiento de sesión si desmarcas «Recordar en este
  dispositivo». Un enlace de emparejamiento en el fragmento de la URL (`#pair=...`) nunca se envía al alojamiento web
  y se quita de la barra de direcciones al instante.
- **La salida no fiable se sanea.** La salida del modelo puede citar archivos y páginas web que el agente leyó, así
  que el Markdown se renderiza con [marked](https://marked.js.org) y se limpia con
  [DOMPurify](https://github.com/cure53/DOMPurify). Las imágenes remotas se bloquean, igual que los enlaces
  `javascript:`.
- **Política de seguridad de contenido estricta.** Las compilaciones de producción no permiten scripts en línea ni
  de terceros, ni imágenes remotas.
- **Sin marcos.** La app se niega a ejecutarse dentro de un marco, así que no puede usarse para clickjacking.

## Navegadores compatibles

La app está pensada para Chrome/Edge 111+, Firefox 115+ y Safari 16+ (iOS 16+). Unos pequeños polyfills cubren las
API más nuevas que usa el cliente de OpenCode. La batería de pruebas de extremo a extremo ejercita las funciones
contra servidores reales de OpenCode en Chromium, Firefox y WebKit, con tamaños de escritorio, iPhone, iPad y
Android (emulación de dispositivos, no dispositivos físicos).

## Limitaciones

- No hay notificaciones mientras la página está cerrada o el teléfono bloqueado. Las notificaciones push web
  necesitarían un servidor que las envíe. Mientras la pestaña está abierta en segundo plano, su título muestra un
  indicador, y puedes activar las notificaciones de escritorio en Ajustes.
- Aún no incluido: la terminal (PTY), la gestión de MCP y proveedores, y la navegación por sesiones de subagentes.

## Desarrollo

```sh
npm install
npm run dev          # http://localhost:5173
npm run lab          # mock LLM + throwaway OpenCode server; prints a pairing link for the dev server
npm run build        # type-check and build into dist/
npm test             # end-to-end tests (see below)
```

`npm run lab` y las pruebas usan `dev/mock-llm.mjs`, un modelo simulado compatible con OpenAI, así que no hace falta
ninguna clave de API. Estos prompts desencadenan comportamientos:

| Prompt | Qué hace el modelo simulado |
| --- | --- |
| `shell: <command>` | llama a la herramienta de shell (solicitud de permiso) |
| `write: <path>` + salto de línea + contenido | escribe un archivo (solicitud de permiso, revertir, Cambios) |
| `ask: <question>` | hace una pregunta de opción múltiple |
| `think` | transmite el razonamiento y luego una respuesta |
| `slow` | transmite durante ~20 s (para probar Detener) |
| `xss` | responde con HTML hostil (para probar el saneador) |

### Pruebas

La batería de Playwright arranca su propio laboratorio: el LLM simulado más un servidor real de OpenCode 2.x, con
directorios de datos y proyectos git desechables. Tu propia configuración de OpenCode nunca se toca.

```sh
npx playwright install --with-deps chromium firefox webkit
OPENCODE_BIN=/path/to/opencode-2.x npm test                                # needs @opencode/cli 2.x
OPENCODE_V1_BIN=/path/to/opencode-1.x OPENCODE_BIN=... npm test            # also runs the 1.x suite
npx playwright test --project=iphone                                       # one device
```

Proyectos: `unit` (lógica de análisis y exportación, sin navegador), `desktop-chrome`, `desktop-firefox`,
`desktop-safari`, `iphone`, `ipad`, `android`. El emparejamiento por QR se prueba desde una foto en todos los
navegadores, y con un flujo de cámara real (de un dispositivo falso) en Chromium.

### Traducciones

Los textos de la interfaz están en `src/i18n/locales/`, un archivo por idioma. `en.ts` define las claves; todos los
demás catálogos se comprueban por tipos contra él, y una prueba unitaria verifica que cada traducción conserve los
`{placeholders}`. Para añadir un idioma, copia `en.ts`, tradúcelo y regístralo en `src/i18n/index.ts`. Las etiquetas
que la app de escritorio de OpenCode solo muestra en inglés (**Pairing**, **Pair device**, **Remote access**) se
quedan en inglés para que coincidan con lo que ves.

### Estructura

```
src/
  lib/types.ts        normalized data model and the Backend interface
  lib/v2.ts           OpenCode 2.x adapter (official @opencode/client)
  lib/v1.ts           OpenCode 1.x adapter
  lib/connect.ts      transport, server detection, pairing, connection diagnostics
  lib/pairing.ts      parsing QR payloads, links and addresses
  lib/markdown.ts     Markdown rendering and sanitization
  lib/export.ts       Markdown export, clipboard, downloads, share sheet
  state/store.ts      connection lifecycle, heartbeat watchdog, event handling, actions
  i18n/               language detection, translation helpers, one catalog per language
  components/         UI (Preact)
dev/                  mock LLM, lab script, icon renderer, smoke script
tests/                Playwright end-to-end tests and lab setup
```

## Licencia

MIT
