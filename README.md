# Flocade 🕹️

**Flo's Arcade** — a gallery of simple web games that are free and awesome.

Live at: https://mattburns.github.io/flocade/

## Adding a game

1. Create `games/<slug>/index.html` — each game is fully self-contained (its own HTML/CSS/JS, no shared dependencies).
2. Add an entry to the `GAMES` array in `js/games.js` with the same `slug`.

That's it. The gallery on the homepage renders itself from the registry.

## Running locally

It's a static site with no build step. Serve the repo root:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000

## Hosting

Hosted on GitHub Pages from the `main` branch (repo root).
