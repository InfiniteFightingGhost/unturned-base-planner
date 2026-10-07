# Unturned Base Planner

A local-first, browser-based 3D base planner for **Unturned**. Design a base in
3D, snap pieces using the game's real building rules, and get exact material
requirements derived from the placed geometry.

> Fan tool. Not affiliated with, sponsored by, or endorsed by Smartly Dressed
> Games Ltd. "UNTURNED" is a registered trademark of Smartly Dressed Games Ltd.
> See [`THIRDPARTYNOTICES.txt`](./THIRDPARTYNOTICES.txt).

## Quick start

```bash
npm ci                 # install dependencies (Node 20+; developed on Node 25)
npx playwright install chromium   # one-time, for E2E
npm run dev            # http://localhost:5173
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit/integration tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run ci` | lint + typecheck + test + build |

## Features

- 3D viewport (orbit / top / front / elevation), infinite grid + snapping.
- Placement that follows Unturned's rules: floors on ground/edges, pillars on
  floor vertices, walls between pillars, roofs on supported edges, doors into
  doorways, hatches/ladders into holes, and more.
- Selection, move/rotate/duplicate/copy-paste, command-based undo/redo.
- Floors (with ghosting), zones + tags, prefabs, arrays/mirror/radial patterns.
- Blueprint (orthographic) views + measurement tools.
- Resource engine: raw-material totals from placed geometry, by piece / floor /
  zone / category, with inventory tracking, build state and progress.
- IndexedDB autosave, project import/export (`.ubp.json`), schema migrations.

## Real models & game data

The app can render the **actual Unturned models** and use the **exact game
asset data**. These are extracted locally from your own Unturned installation
and are intentionally **not** committed to this repository.

```bash
# Requires the game installed and Python with UnityPy:
pip3 install --user UnityPy
/home/andy/.pyenv/versions/3.10.19/bin/python tools/extract_unturned_models.py
node tools/extract_unturned_data.mjs
```

- Models → `public/models/*.obj` (git-ignored) + `public/models/manifest.json`
  (tracked). Without them the app falls back to procedural proxy geometry.
- Data → `src/data/generated/game-definitions.json` (tracked).

See [`tools/README.md`](./tools/README.md) and [`HANDOFF.md`](./HANDOFF.md).

## Documentation

- [`HANDOFF.md`](./HANDOFF.md) — architecture, status, remaining work, push steps.
- [`THIRDPARTYNOTICES.txt`](./THIRDPARTYNOTICES.txt) — U3 SDK License Agreement.
