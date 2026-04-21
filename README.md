# Quick Rewrite

Quick Rewrite is a lightweight desktop text-rewrite assistant for macOS and Windows.

Select text in any app, press a global shortcut, and instantly get ready-to-copy rewrite suggestions — grammar fix, polished rewrite, and four tone variants — in a single request.

## Features

- Global shortcut captures selected text from any app
- Auto-generates suggestions the moment your text loads
- Grammar fix, improved rewrite, and four tones (Casual, Friendly, Formal, Professional) in one call
- One-click copy with visual confirmation
- OpenRouter and OpenAI provider support, configurable from Settings
- Settings form shows only the relevant provider's fields
- Keyboard shortcuts: `Cmd/Ctrl+Enter` to generate, `Esc` to dismiss
- In-memory result cache (5 minutes) to avoid duplicate requests
- macOS Accessibility guidance built into the Setup tab
- System tray icon with quick open and quit

## How it works

1. Select text in any app.
2. Press your shortcut (default: `CommandOrControl+Shift+Space`).
3. Quick Rewrite captures the selection, opens near your cursor, and starts generating automatically.
4. Click **Copy** next to the version you want.

On macOS the app uses `System Events` to trigger `Cmd+C`, which requires Accessibility access (guided in the Setup tab). On Windows it uses `SendKeys` through PowerShell.

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- macOS or Windows

### Install and run

```bash
npm install
cp .env.example .env
npm start
```

### Environment variables

OpenRouter (default):

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_HTTP_REFERER=https://example.com
OPENROUTER_APP_TITLE=Quick Rewrite
```

OpenAI:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

You can also configure everything from the **Settings** tab inside the app without touching `.env`.

> Do not commit `.env` or real API keys to version control.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Capture text and open app | `CommandOrControl+Shift+Space` (configurable) |
| Generate suggestions | `Cmd/Ctrl+Enter` |
| Dismiss window | `Esc` |

## Local Development

```bash
npm start        # run the app
npm run check    # syntax check all source files
```

## Build

```bash
npm run build
```

Targets:

| Platform | Output |
|---|---|
| macOS | `.dmg`, `.zip` |
| Windows | NSIS installer, portable `.exe` |

## Releases

Releases are built automatically by GitHub Actions whenever a version tag is pushed. Only user-facing installer binaries (`.dmg`, `.zip`, `.exe`) are attached — auto-updater metadata files are excluded.

### Creating a release

```bash
# Bump the version in package.json first, then:
git add package.json
git commit -m "chore: release v1.1.0"
git tag v1.1.0
git push origin main --tags
```

The `Release` workflow triggers on `v*` tags, builds on `macos-latest` and `windows-latest`, and uploads the artifacts to a new GitHub Release automatically. The `GITHUB_TOKEN` secret is available by default — no extra setup needed.

### macOS code signing (optional)

Without a signing certificate, Gatekeeper will warn users when they first open the app. To sign:

1. Export your Apple Developer certificate as a `.p12` file.
2. Base64-encode it: `base64 -i cert.p12 | pbcopy`
3. Add two repository secrets in **Settings → Secrets → Actions**:
   - `CSC_LINK` — the base64 string
   - `CSC_KEY_PASSWORD` — your `.p12` password
4. Uncomment the `CSC_LINK` and `CSC_KEY_PASSWORD` lines in `.github/workflows/release.yml`.

## Project Structure

```
src/
  main.js              Electron main process, IPC handlers, tray, shortcut
  preload.js           Secure contextBridge for renderer
  rewriteService.js    OpenRouter / OpenAI requests, JSON parsing, cache
  renderer/
    index.html         App shell and settings form
    renderer.js        UI logic and IPC event wiring
    styles.css         Design tokens and component styles
.github/
  workflows/
    release.yml        Automated release workflow
```

## Notes

- API keys are stored in local app settings in plain text. Encryption is on the roadmap.
- Linux is not yet supported.
- The global shortcut is user-configurable from the Settings tab.

## Roadmap

- Support "replace selected text" after choosing a tone
- Add tone presets: concise, persuasive, confident, empathetic
- Encrypt stored API keys
- Linux support

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## License

MIT. See [LICENSE](LICENSE).
