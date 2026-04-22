# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run app in development (electron .)
npm run check      # Syntax-check all 4 source files (node --check, no linter)
npm run build      # Package for macOS (.dmg/.zip) and Windows (.exe) via electron-builder
```

There is no test suite. There is no TypeScript compile step — the source runs directly in Electron.

To run a single syntax check on a modified file:
```bash
node --check src/main.js
```

## Architecture

**Quick Rewrite** is a frameless Electron desktop app that captures selected text via a global hotkey and returns 6 AI-generated rewrites (Grammar Fix, Improved, Casual, Friendly, Formal, Professional) in a single LLM request.

### Process boundaries

```
Renderer (vanilla HTML/JS)
  ↓ ipcRenderer.invoke / ipcRenderer.on
Preload (src/preload.js)          ← context bridge; only touchpoint between renderer and Node
  ↓ ipcMain.handle / ipcMain.send
Main (src/main.js)                ← platform logic, IPC routing, settings I/O, shortcuts
  ↓ fetch
rewriteService.js                 ← LLM API calls, JSON parsing/repair, 5-min in-memory cache
```

Context isolation is enabled — the renderer has zero direct access to Node APIs.

### Key files

| File | Responsibility |
|---|---|
| `src/main.js` | App lifecycle, global shortcut, tray, text capture (platform-specific), IPC handlers, settings I/O |
| `src/preload.js` | Exposes safe subset of IPC to renderer via `contextBridge` |
| `src/rewriteService.js` | OpenRouter/OpenAI calls, JSON schema output, cache, JSON repair |
| `src/renderer/renderer.js` | UI state, three-tab logic (Rewrite/Setup/Settings), IPC wiring |
| `src/renderer/index.html` | Shell layout, card template used by `renderResults()` |
| `src/renderer/styles.css` | Design tokens, warm brown/tan palette (`--accent: #c85d32`), frameless window drag regions |

### Text capture flow

1. Global shortcut fires → `main.js` saves clipboard, simulates Cmd+C (macOS: `osascript System Events`, Windows: PowerShell), waits 220ms, reads clipboard, restores original clipboard.
2. Main sends `selection:loaded` → renderer auto-populates textarea.
3. If auto-generate is on and provider is configured, `runRewrite()` fires immediately.

### Settings & config

- **Runtime settings**: `{userData}/settings.json` — merged with `.env` defaults at startup. Includes shortcut, provider choice, API keys, model names, custom system prompt, auto-generate flag.
- **Dev config**: `.env` (copy from `.env.example`). Required keys: `LLM_PROVIDER`, and the matching provider's `API_KEY`/`MODEL`/`BASE_URL`.
- There is no encryption — API keys are stored in plain text.

### LLM integration

`rewriteService.js` targets either OpenRouter (`/chat/completions`) or OpenAI (`/responses`). It requests a strict JSON schema response with fields `grammar_fixed`, `rewritten`, and `tones[]`. If the model returns malformed JSON, it attempts self-repair by making a second LLM call to fix it. Cache is a `Map` keyed by `provider|model|inputText|customPrompt`.

### CI/CD

GitHub Actions (`.github/workflows/release.yml`) triggers on `v*` tags. It runs `npm ci` → `npm run check` → `npm run build` on macOS and Windows runners in parallel, then uploads artifacts to a GitHub Release (repo: `Gohelraj/quick-rewrite`).

Releases are cut by updating `version` in `package.json`, committing, and pushing a matching tag.
