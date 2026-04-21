# Contributing

## Local Setup

```bash
npm install
cp .env.example .env
npm start
```

Use `npm run check` before opening a pull request.

## Guidelines

- Keep changes focused and easy to review.
- Do not commit secrets, `.env`, or packaged build artifacts.
- Prefer small UI and behavior improvements over large unrelated refactors.
- Update `README.md` when setup, permissions, or provider behavior changes.

## Pull Requests

- Describe the user-facing change clearly.
- Include screenshots or short recordings for UI changes when possible.
- Mention macOS and Windows behavior if your change affects capture or permissions.
