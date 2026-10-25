# OC Remote Web

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · **Français** · [한국어](README.ko.md)

Une télécommande pour [OpenCode](https://opencode.ai) qui fonctionne entièrement dans le navigateur. Ouvrez la page
sur votre téléphone, votre tablette ou un autre ordinateur, scannez le QR code de `opencode pair`, et pilotez vos
sessions OpenCode : discutez, approuvez des commandes, répondez aux questions de l'agent, changez de modèle, revenez
sur des tours, examinez les modifications et exportez les conversations.

Il n'y a pas de backend. La page n'est faite que de fichiers statiques ; elle parle directement à votre propre
serveur OpenCode, et le jeton de couplage reste dans le stockage de votre navigateur.

## Fonctionnalités

- **Couplage** : scannez le QR code de `opencode pair` avec l'appareil photo (ou depuis une photo), collez un lien de
  couplage, ou connectez-vous avec un mot de passe. Plusieurs serveurs peuvent être enregistrés ; chacun est mémorisé
  sur cet appareil uniquement, ou seulement le temps de l'onglet.
- **Projets et sessions** : passez d'un projet à l'autre, ouvrez n'importe quel dossier du serveur, recherchez,
  créez, renommez, bifurquez et supprimez des sessions.
- **Discussion** : réponses en direct avec Markdown, raisonnement repliable, et cartes d'outils (sortie du shell,
  diffs de fichiers pour les modifications et écritures). Joignez des images et des fichiers (sélecteur, coller, ou
  glisser-déposer). `!command` exécute une commande shell, `/` liste les commandes du serveur.
- **Contrôle du modèle** : choisissez l'agent, le modèle et l'effort de raisonnement pour chaque session.
- **Débloquer l'agent** : les demandes d'autorisation (autoriser une fois / toujours / refuser avec une note) et les
  questions de l'agent s'affichent au-dessus de la zone de saisie, avec un repère quand une autre session vous attend.
- **Revenir en arrière** : ramenez une session à l'état d'avant n'importe quel message, modifications de fichiers
  comprises ; annulez le retour ou supprimez les messages annulés.
- **Modifications** : voyez quels fichiers un tour a modifiés (« 2 fichiers modifiés ») ou le diff de toute la session.
- **Copier et exporter** : copiez un message ou toute la conversation en Markdown, téléchargez-la en Markdown ou JSON,
  ou utilisez le menu de partage sur téléphone.
- **Santé de la connexion** : état en direct avec la latence, un chien de garde par battements de cœur qui reconnecte
  les flux coupés (fréquent quand un téléphone se met en veille ou change de réseau), et un test de connexion.
- **Fonctionne partout** : mises en page pour téléphone, tablette et ordinateur ; installable comme une app (PWA) ;
  thèmes clair et sombre.
- **Votre langue** : English, 日本語, 简体中文, 繁體中文, Español, Français et 한국어. L'app suit la langue du
  système ; vous pouvez la changer sur l'écran de connexion ou dans les Paramètres.
- **OpenCode 2.x et 1.x** : l'app de bureau et `@opencode/cli` 2.x, ainsi que les serveurs `opencode-ai` 1.x.

## Installation

### 1. Héberger la page (une fois)

N'importe quel hébergement statique convient. Le dépôt inclut un workflow GitHub Pages :

1. Poussez ce dépôt sur GitHub.
2. Dans les paramètres du dépôt, allez dans **Pages** et réglez **Source** sur **GitHub Actions**.
3. Chaque push sur `main` compile et publie l'app (`.github/workflows/pages.yml`).

Préférez un hébergement qui donne à l'app **sa propre origine**. Tous les sites de projet GitHub Pages d'un même
compte partagent `https://<user>.github.io`, et donc le stockage du navigateur où se trouve votre jeton de couplage :
n'importe quelle autre page que vous y publiez pourrait le lire. Un domaine personnalisé, ou Cloudflare Pages /
Netlify avec leur propre sous-domaine, évite ce problème. Ces deux hébergeurs appliquent aussi les en-têtes de
sécurité de `public/_headers`.

Vous pouvez aussi lancer `npm run build` et copier `dist/` où vous voulez.

### 2. Autoriser l'origine de l'app sur votre ordinateur (une fois)

Les navigateurs ne laissent une page parler à votre serveur OpenCode que si le serveur autorise l'origine de la page
(CORS). L'app affiche la commande exacte avec votre origine déjà remplie. Pour l'app de bureau ou `@opencode/cli` 2.x
(le service en arrière-plan) :

```sh
opencode service set cors https://your-app.example
opencode service restart
```

**Vous n'utilisez que l'app de bureau OpenCode ?** Elle exécute le même service en arrière-plan et embarque la CLI,
vous n'avez donc rien à installer. Le message d'erreur et le guide de configuration de l'app affichent ces commandes
avec votre origine déjà remplie, pour le système qu'elle détecte (ou que vous choisissez : macOS / Windows / Linux).

macOS (Terminal), ou utilisez le menu de l'app **OpenCode → Installer la CLI...** puis les commandes ci-dessus :

```sh
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service set cors https://your-app.example
"/Applications/OpenCode.app/Contents/Resources/opencode-cli" service restart
```

Windows (PowerShell) :

```powershell
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service set cors "https://your-app.example"
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" service restart
```

Linux (app .deb / .rpm ; pour l'AppImage, utilisez la CLI) :

```sh
/opt/OpenCode/resources/opencode-cli service set cors https://your-app.example
/opt/OpenCode/resources/opencode-cli service restart
```

L'origine se limite au schéma et à l'hôte : `https://you.github.io`, pas `https://you.github.io/oc-remote-web/`.
Redémarrer le service arrête les agents en cours, faites-le donc quand rien ne tourne. Le réglage est enregistré dans
`~/.config/opencode/service.json` (`%USERPROFILE%\.config\opencode\service.json` sous Windows).

Avant la première connexion, l'app ne peut que deviner sur quel système tourne OpenCode, car le navigateur masque
les réponses du serveur tant que CORS ne les autorise pas. Elle le déduit du port du serveur (28894 par défaut sous
Windows, 49374 sous macOS/Linux), de votre dernier choix, ou de l'appareil depuis lequel vous naviguez. Après une
première connexion, elle lit le système dans les chemins du serveur et s'en souvient.

Si vous autorisez déjà d'autres origines, listez-les toutes, séparées par des virgules. Si vous utilisez plutôt un
serveur autonome, utilisez `opencode serve --cors https://your-app.example`. Pour la 1.x, utilisez
`opencode serve --cors https://your-app.example` avec `OPENCODE_SERVER_PASSWORD` défini.

### 3. Coupler un appareil

```sh
opencode pair --remote
```

Dans l'app de bureau, utilisez plutôt **Pairing → Pair device** et activez **Remote access**. Scannez le QR code dans
l'app, ou collez le lien affiché (ou copié). `--remote` fournit une adresse HTTPS via le tunnel d'OpenCode, utilisable
de partout. Les liens de couplage ne servent qu'une fois et expirent au bout de 5 minutes ; l'appareil reste ensuite
connecté pendant 30 jours. Pour déconnecter tous les appareils, changez le mot de passe du serveur
(`opencode service set password ...`).

Autres façons de joindre votre serveur :

- **Tailscale ou un Cloudflare Tunnel** : placez une adresse HTTPS devant le serveur et lancez
  `opencode pair --url https://your-address`.
- **Même Wi-Fi** : lancez `opencode service set hostname 0.0.0.0`, puis `opencode pair`. Le QR code contient alors des
  adresses LAN en `http://` non chiffré. Les navigateurs les bloquent depuis une page `https://` (« contenu mixte »).
  Les versions récentes de Chrome peuvent les autoriser après avoir demandé l'accès au réseau local (l'app le demande,
  mais ce chemin n'est pas testé) ; sinon, servez l'app en HTTP simple sur votre réseau local, ou utilisez l'une des
  options HTTPS ci-dessus.
- **Mot de passe** : dans l'onglet Mot de passe, saisissez l'adresse du serveur et le mot de passe (serveurs 1.x, ou
  `opencode serve` avec `OPENCODE_SERVER_PASSWORD`).

### L'installer comme une app

- **iPhone/iPad** : dans Safari, touchez Partager, puis Sur l'écran d'accueil. L'app installée a son propre stockage,
  couplez-la donc une nouvelle fois depuis l'app.
- **Android** : dans Chrome, ouvrez le menu et choisissez Installer l'application (ou Ajouter à l'écran d'accueil).

## Sécurité

La page peut approuver des commandes shell sur votre machine, elle est donc conçue de façon défensive :

- **Pas de backend.** Rien n'est envoyé ailleurs qu'à votre propre serveur. Pas de mesure d'audience, pas de requêtes
  vers des tiers.
- **Les identifiants restent en local.** Le jeton de couplage, ou le mot de passe si vous en utilisez un, est conservé
  dans le stockage de ce navigateur, ou seulement dans le stockage de session si vous décochez « Mémoriser sur cet
  appareil ». Un lien de couplage dans le fragment de l'URL (`#pair=...`) n'est jamais envoyé à l'hébergeur web et
  disparaît immédiatement de la barre d'adresse.
- **Les contenus non fiables sont assainis.** La sortie du modèle peut citer des fichiers et des pages web lus par
  l'agent : le Markdown est donc rendu avec [marked](https://marked.js.org) et nettoyé avec
  [DOMPurify](https://github.com/cure53/DOMPurify). Les images distantes sont bloquées, tout comme les liens
  `javascript:`.
- **Politique de sécurité du contenu stricte.** Les builds de production n'autorisent ni scripts en ligne, ni scripts
  tiers, ni images distantes.
- **Pas d'intégration dans un cadre.** L'app refuse de s'exécuter dans un cadre, elle ne peut donc pas servir au
  détournement de clic (clickjacking).

## Navigateurs pris en charge

L'app vise Chrome/Edge 111+, Firefox 115+ et Safari 16+ (iOS 16+). De petits polyfills couvrent les API récentes
qu'utilise le client OpenCode. La suite de tests de bout en bout vérifie les fonctionnalités face à de vrais serveurs
OpenCode dans Chromium, Firefox et WebKit, aux formats ordinateur, iPhone, iPad et Android (émulation d'appareils, pas
d'appareils physiques).

## Limites

- Pas de notifications quand la page est fermée ou le téléphone verrouillé. Les notifications push web
  nécessiteraient un serveur pour les envoyer. Quand l'onglet est ouvert en arrière-plan, son titre affiche un badge,
  et les notifications de bureau peuvent être activées dans les Paramètres.
- Pas encore inclus : le terminal (PTY), la gestion des MCP et des fournisseurs, et la consultation des sessions de
  sous-agents.

## Développement

```sh
npm install
npm run dev          # http://localhost:5173
npm run lab          # mock LLM + throwaway OpenCode server; prints a pairing link for the dev server
npm run build        # type-check and build into dist/
npm test             # end-to-end tests (see below)
```

`npm run lab` et les tests utilisent `dev/mock-llm.mjs`, un modèle factice compatible OpenAI, donc aucune clé d'API
n'est nécessaire. Ces prompts déclenchent des comportements :

| Prompt | Ce que fait le modèle factice |
| --- | --- |
| `shell: <command>` | appelle l'outil shell (demande d'autorisation) |
| `write: <path>` + saut de ligne + contenu | écrit un fichier (demande d'autorisation, retour en arrière, Modifications) |
| `ask: <question>` | pose une question à choix multiples |
| `think` | diffuse un raisonnement, puis une réponse |
| `slow` | diffuse pendant ~20 s (pour tester Arrêter) |
| `xss` | répond avec du HTML hostile (pour tester l'assainissement) |

### Tests

La suite Playwright démarre son propre labo : le LLM factice plus un vrai serveur OpenCode 2.x, avec des dossiers de
données et des projets git jetables. Votre propre configuration OpenCode n'est jamais touchée.

```sh
npx playwright install --with-deps chromium firefox webkit
OPENCODE_BIN=/path/to/opencode-2.x npm test                                # needs @opencode/cli 2.x
OPENCODE_V1_BIN=/path/to/opencode-1.x OPENCODE_BIN=... npm test            # also runs the 1.x suite
npx playwright test --project=iphone                                       # one device
```

Projets : `unit` (logique d'analyse et d'export, sans navigateur), `desktop-chrome`, `desktop-firefox`,
`desktop-safari`, `iphone`, `ipad`, `android`. Le couplage par QR code est testé depuis une photo dans tous les
navigateurs, et via un vrai flux de caméra (d'un appareil factice) dans Chromium.

### Traductions

Les textes de l'interface se trouvent dans `src/i18n/locales/`, un fichier par langue. `en.ts` définit les clés ; tous
les autres catalogues sont vérifiés par typage par rapport à lui, et un test unitaire contrôle que chaque traduction
conserve les `{placeholders}`. Pour ajouter une langue, copiez `en.ts`, traduisez-le et déclarez-le dans
`src/i18n/index.ts`. Les libellés que l'app de bureau OpenCode n'affiche qu'en anglais (**Pairing**, **Pair device**,
**Remote access**) restent en anglais pour correspondre à ce que vous voyez.

### Organisation

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

## Licence

MIT
