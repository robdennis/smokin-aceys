# Smokin' Aceys

Acey Deucey card game betting strategy simulator. Single-page web app with interactive charts.

## Tech

- Vanilla HTML/CSS/JS (no build step)
- Tailwind CSS (CDN)
- Plotly.js for chart visualization
- Web Worker (`worker.js`) for background simulation computation

## Files

- `index.html` — full app UI and styles
- `scripts.js` — game logic, UI state management, chart rendering
- `worker.js` — simulation engine (runs in background thread)

## Deployment

Deployed to GitHub Pages via `.github/workflows/static.yml` — pushes to `main` trigger a deploy of the entire repo root as static content. No build step needed.

## Public Repo

This project is publicly hosted at `robdennis/smokin-aceys` and synced from the monorepo via git subtree. The public GitHub Pages URL is the distributable.
