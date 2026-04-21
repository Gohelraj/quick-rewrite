# Quick Rewrite

Quick Rewrite is a desktop text-rewrite assistant for macOS and Windows.

It lets you select text in any app, press a global shortcut, and instantly get ready-to-copy rewrite options like:

- select text in any app
- press one global shortcut
- see grammar-fixed and rewritten versions
- copy the tone you want, such as casual, friendly, formal, or professional
- run from the system tray and change settings like the shortcut and model provider

## Features

- global shortcut to capture selected text from other apps
- polished popup UI with setup, rewrite, and settings screens
- grammar fix plus multiple rewrite tones in one request
- OpenRouter and OpenAI provider support
- macOS setup guidance for Accessibility permission
- lightweight in-memory caching for repeated rewrites

## Demo Flow

1. Select text in any app.
2. Press `CommandOrControl + Shift + Space`.
3. Quick Rewrite captures the selection and opens near your cursor.
4. Generate rewrite suggestions.
5. Copy the version you want.

## How it works

- On macOS, the app uses `System Events` to trigger `Cmd+C`, which requires Accessibility access.
- On Windows, it uses `SendKeys` through PowerShell to trigger `Ctrl+C`.
- The app restores the prior clipboard text after capture.
- Rewrites are requested from either OpenRouter or OpenAI.

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- macOS or Windows

### Setup

```bash
npm install
cp .env.example .env
```

Add your provider settings in `.env`.

OpenRouter is the default:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=openai/gpt-5-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_HTTP_REFERER=https://example.com
OPENROUTER_APP_TITLE=Quick Rewrite
```

If you want to use OpenAI directly:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Do not commit `.env` or real API keys to GitHub.

## Local Development

```bash
npm start
```

Run the lightweight checks:

```bash
npm run check
```

## Build

```bash
npm run build
```

Configured targets:

- macOS: `dmg`, `zip`
- Windows: `nsis`, `portable`

## Project Structure

```text
src/
  main.js              Electron main process
  preload.js           Secure renderer bridge
  rewriteService.js    Provider requests and caching
  renderer/
    index.html         UI shell
    renderer.js        UI behavior
    styles.css         UI styling
```

## Notes

- macOS will need Accessibility permissions because the app triggers the copy shortcut through `System Events`.
- Windows may need permission to send keystrokes from PowerShell to the active app.
- Linux is not wired up in this first version.
- The shortcut now lives in Settings and is stored per user on the machine.
- OpenRouter support uses the current OpenRouter chat completions format with optional `HTTP-Referer` and `X-OpenRouter-Title` headers.
- API keys are currently stored in local app settings in plain text for convenience.

## Roadmap

- support "replace selected text" after choosing a tone
- add tone presets like concise, persuasive, confident, and empathetic
- show loading, retries, and token or cost controls
- encrypt stored API keys instead of saving them in plain local settings

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](/Volumes/d/Node_Projects/rewrite-helper/CONTRIBUTING.md) before opening a PR.

## License

MIT. See [LICENSE](/Volumes/d/Node_Projects/rewrite-helper/LICENSE).
