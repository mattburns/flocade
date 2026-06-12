# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Flocade ("Flo's Arcade") is a static GitHub Pages site hosting a gallery of simple, free web games. No build step, no framework, no dependencies — plain HTML/CSS/JS served from the repo root.

## Running locally

```sh
python3 -m http.server 8000
```

There are no tests or linters configured.

## Architecture

- `index.html` + `js/main.js` render the homepage gallery from `games.json` (the game registry), fetched with `cache: 'no-store'` so new games appear immediately despite GitHub Pages' fixed 10-minute `max-age` caching.
- Each game lives at `games/<slug>/index.html` and must be **fully self-contained** — its own HTML/CSS/JS in one file or folder, no shared code with the gallery or other games. Games link back to the gallery with `../../`.
- To add a game: create `games/<slug>/index.html`, then add a `{ slug, title, icon, description }` entry to `games.json`. The `slug` must match the folder name.

## Conventions

- Visual theme: dark retro-arcade (background `#0d0221`, neon pink `#ff2e88`, cyan `#00f0ff`, yellow `#ffe600`, "Press Start 2P" font). Games should follow the same palette so the arcade feels cohesive.
- Games should work with mouse, touch, and keyboard where it makes sense — they get played on phones too.
- All paths must stay relative (the site is served from `/flocade/` on GitHub Pages, not the domain root).
