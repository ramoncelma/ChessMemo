# ChessMemo

A spaced-repetition trainer for chess openings and tactics, built as an
installable web app (PWA). Works in any modern browser on iOS, Android, and
desktop — no app store required.

Import a PGN, pick which side you play, and ChessMemo turns the moves into
recall cards scheduled with the [FSRS](https://github.com/open-spaced-repetition)
algorithm. Your progress is saved locally in the browser.

## Tech

- React + TypeScript + Vite
- [chess.js](https://github.com/jhlywa/chess.js) — move rules
- [react-chessboard](https://github.com/Clariity/react-chessboard) — board UI
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) — scheduling
- IndexedDB (via idb-keyval) for local storage
- vite-plugin-pwa for offline / installable support

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build
npm run preview  # preview the production build
```

## Deploy

Pushing to the development branch triggers `.github/workflows/deploy.yml`,
which builds the app and publishes it to GitHub Pages. Enable Pages once in
**Settings → Pages → Source: GitHub Actions**.

## Roadmap

- Phase 1 (now): frontend-only PWA, data stored in the browser, hosted free on
  GitHub Pages.
- Phase 2 (later): backend with user accounts and sync, custom domain, optional
  native app store wrappers via Capacitor.
