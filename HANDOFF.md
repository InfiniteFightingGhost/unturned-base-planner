# Handoff — Unturned Base Planner

_Last updated: 2026-10-07. Written at the end of a large build session._

This document is the starting point for continuing work (e.g. from another
machine). Read it before touching code.

---

## 1. TL;DR status

A working local-first 3D base planner for Unturned is implemented end to end:

- **14 commits**, `lint` + `typecheck` + **407 unit/integration tests** +
  **13 Playwright E2E** + production build all green.
- The full v1 feature path (P0–P42) is done, plus a game-faithful **build
  logic** engine derived from the public U3 SDK, and **real Unturned models**
  extracted from a local game install.
- Remaining: stats/optimization (P38–P39), exports (P43–P45), construction
  guide (P46–P48), perf/benchmark (P53–P54), static deploy (P58), UI polish,
  and V2 sharing (P59–P63).

The single most important thing to know: **extracted game models are
git-ignored** and must be regenerated locally (`tools/`). Everything else is
committed.

---

## 2. Quick start

```bash
npm ci
npx playwright install chromium
npm run dev            # http://localhost:5173
npm run ci             # the full gate
```

Environment used: Node v25.2.1, npm 11.6.2, Python 3.10.19 (pyenv) with
UnityPy 1.25.4.

---

## 3. Repository layout

```
src/
  domain/        Pure model + rules. No React/three/DOM.
    build/       Unturned building engine (EConstruct/EBuild, housing graph,
                 slot search, validation, support).
  data/          Unturned dataset (112 definitions, recipes) + generated/
                 (authoritative game-definitions.json from the game's .dat).
  resources/     Pure resource aggregation (totals, filters, inventory).
  engine/        R3F viewport, camera, grid, BatchedMesh renderer, model loader.
    assets/      ModelLibrary + manifest loader (real .obj models, proxy fallback).
  editor/        Store (zustand), commands, selection, transforms, tools,
                 build-aware placement, warnings.
  ui/            Blender/CAD-style shell (TopBar, docks, panels).
  persistence/   IndexedDB autosave, project files, migration-on-load.
  lib/           Shared pure utilities (snapping math).
tools/           Local extraction scripts (Python + Node). See tools/README.md.
public/models/   manifest.json (tracked) + *.obj (git-ignored).
tests/           unit/, integration/, e2e/.
```

**Layer rule (enforced by ESLint):** `domain` and `resources` must stay pure —
no `three`, React, or editor/engine imports. Keep it that way.

---

## 4. Architecture decisions (and why)

- **Vite + React 19 + TypeScript (strict).** SPA, static deploy, no backend.
- **zod schemas are the single source of truth** for types, runtime validation
  and versioned migration (`CURRENT_SCHEMA_VERSION = 3`).
- **All document mutations flow through a `Command` bus** backed by immer
  patches. Undo/redo cannot be bypassed. `setProject` is load-only.
- **Rendering is an imperative `THREE.BatchedMesh`** (one per floor), driven by
  transient zustand subscriptions. React never renders per-instance nodes.
  Geometry is keyed by **definitionId** (tiers can have different models).
- **Per-object frustum culling is disabled** (correctness-first): BatchedMesh
  per-instance bounds are not invalidated by `setMatrixAt`, which caused pieces
  to vanish/reappear. Re-enabling safely is a perf task.
- **Asset seam:** `AssetResolver` (proxies) + `ModelLibrary` (real `.obj`).
  Missing models fall back to category-aware procedural geometry; loading is
  async and never blocks the editor.
- **Persistence is local-first:** IndexedDB autosave (debounced/idle), project
  files (`.ubp.json` envelope), migrations on every load path.

---

## 5. Feature status vs the original plan

| Area | Tasks | Status |
| --- | --- | --- |
| Foundation | P0 | Done |
| Domain model | P1–P4 | Done (schema v3, migrations) |
| Data layer | P5–P7 | Done; dataset corrected to the real 6 m grid; real models wired |
| Rendering | P8–P10 | Done (viewport, cameras, grid) |
| Manipulation | P11–P15 | Done (place/select/transform/copy-paste/undo) |
| Floors | P16–P17 | Done (incl. ghosting) |
| Productivity | P18–P21 | Done (arrays/mirror/radial/prefabs) |
| Blueprint | P22–P24 | Done (ortho views, measurement) |
| Zones | P25–P26 | Done |
| Resources | P27–P35 | Done (totals, per floor/zone, inventory, progress) |
| Validation | P36–P37 | Done — faithful to U3 SDK |
| Optimization | P38–P39 | **Not started** |
| Persistence | P40–P42 | Done |
| Export | P43–P45 | **Not started** |
| Construction guide | P46–P48 | **Not started** |
| UX | P49–P52 | Mostly done; needs a polish pass |
| Performance | P53–P54 | **Not started** (no benchmark; culling off) |
| QA | P55–P57 | Ongoing (407 unit + 13 E2E) |
| Deploy | P58 | **Not started** (config present) |
| V2 sharing | P59–P63 | Deferred by design |

---

## 6. Build logic (the important part)

Derived from the public **`SmartlyDressedGames/U3-SDK`** source
(`HousingConnections`, `UseableHousingUtils`, `UseableStructure`,
`UseableBarricade`, `EConstruct`, `EBuild`).

- Grid: `EDGE_LENGTH = 6`, `WALL_HEIGHT = 4.25`, pivots `2.125` / `0.9`,
  `LINK_TOLERANCE = 0.02`, max placement `16 m`, slot search `8 m`.
- Structures (`EConstruct`): floors on ground/edges, pillars on floor vertices,
  walls require full-height pillars at both ends, roofs need a `CanAttachRoof`
  edge. Result codes: `Success / MissingSlot / Obstructed / MissingPillar /
  MissingGround / ObstructedByGround`.
- Barricades (`EBuild`): doors→doorways, gates→garages, hatches/ladders→holes,
  fortification/shutter/glass→windows, wall-mounts need a vertical face,
  ground types need an upward normal, freeform 15° snap. Base pitch `-90°`
  except door/gate/shutter/hatch.
- Location: `src/domain/build/` (pure) and `src/editor/buildPlacement.ts`
  (editor integration + human-readable messages).

**Approximations to be aware of** (documented in code): flat ground plane at
`y = 0`, AABB overlap (no terrain/character/claim/safezone checks), walls may
be placed freestanding until a floor/roof base exists, barricade slots fall
back to piece-name matching, floating-piece render tint deferred.

---

## 7. Real models & game data (regenerating)

The game art is **not** in the U3 SDK repo; it lives in the game install's
`core_linux.masterbundle`. Extraction scripts are in `tools/`:

```bash
pip3 install --user UnityPy
/home/andy/.pyenv/versions/3.10.19/bin/python tools/extract_unturned_models.py   # public/models/*.obj + manifest.json
node tools/extract_unturned_data.mjs                                            # src/data/generated/game-definitions.json
```

- Default game path: `~/.local/share/Steam/steamapps/common/Unturned/Bundles/`.
- `public/models/*.obj` are **git-ignored** (copyrighted game art — do not
  redistribute). `public/models/manifest.json` is tracked.
- On a machine **without** the game, the app still runs and uses proxy geometry.
- `src/data/generated/game-definitions.json` (376 pieces, all blueprint GUIDs
  resolved) is tracked and is the authoritative source for construct/build/
  health/range/recipes. **It is not yet wired into the runtime dataset** — see
  next steps.

---

## 8. Licensing / compliance

- Code derived from the U3 SDK is under the **U3 SDK License Agreement**:
  free, **non-commercial, desktop-only** mods, with attribution and notice
  requirements. Full text in `THIRDPARTYNOTICES.txt` (also required to ship).
- **No mobile/console/cloud delivery.** A public website must be treated as a
  desktop tool; consider a desktop-only notice/gate before deploying.
- **Do not redistribute extracted game art.** Keep `public/models/*.obj`
  git-ignored (already configured).
- In-app disclaimer added to the status bar; keep it.

---

## 9. Next steps (suggested order)

1. **Wire the authoritative game data** (`src/data/generated/game-definitions.json`)
   into the dataset: replace researched recipes/dimensions with exact values,
   and resolve the "stacked logs" recipe inputs. This makes P5/P6 exact.
2. **Exports (P43–P45):** CSV resource list, printable construction plan
   (print-to-PDF), image export (viewport/blueprint).
3. **Stats & optimization (P38–P39):** design statistics + advisory suggestions.
4. **Construction guide (P46–P48):** phases, interactive build mode, steps.
5. **Performance (P53–P54):** re-enable per-object culling with correct bounds,
   code-split three (bundle ~1.4 MB), benchmark 1k/5k/10k/20k pieces.
6. **Deploy (P58):** static host (Vercel/Netlify/Cloudflare/GitHub Pages) —
   `vercel.json` exists; add CI deploy + desktop-only notice.
7. **UI polish:** the right dock is dense (all sections open because E2E drives
   them directly); add a compact/tabbed mode and update tests.
8. **Build-logic parity:** remove the freestanding-wall bootstrap, add the
   floating tint, distinguish hole/doorframe/garage categories, and model
   claims/safezones as optional checks.

---

## 10. Known issues / gotchas

- **BatchedMesh culling is disabled** for correctness; large scenes may be
  slower than necessary. Fixing requires correct per-instance bounds.
- **Wall/floor model bounds** differ from the logical 6 m grid (walls ~5.6 m
  with trim; floors include a 10.25 m skirt). This is authentic; do not "fix"
  the models — the build logic uses the grid, not the mesh bounds.
- **Bundle size** ~1.4 MB (three.js unsplit).
- The `status-bar` "Materials: pending raw expansion" placeholder was replaced
  by a disclaimer; materials are computed in the resource panels.
- Extracted OBJ files are large in aggregate; loading is background-only.

---

## 11. Push to GitHub

The repo has **no remote** yet. Create an empty GitHub repo, then:

```bash
git remote add origin git@github.com:<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

Notes:

- `public/models/*.obj` and other extracted art are git-ignored, so they will
  **not** be pushed (good). `public/models/manifest.json` and
  `src/data/generated/game-definitions.json` **will** be pushed.
- `.github/workflows/ci.yml` runs lint/typecheck/test/build on push/PR.
- On another machine: `npm ci && npx playwright install chromium`, then either
  re-run `tools/extract_unturned_models.py` (needs Unturned + UnityPy) or accept
  proxy geometry.

---

## 12. Commit history (14 commits before this handoff)

```
3190064 feat: snap placement to Unturned slots with validity and warnings
2c1c7b8 feat: correct dataset to the game-accurate 6 m grid
50a83be feat: add barricade attachment rules faithful to U3-SDK
a0b0b6a feat: implement Unturned housing graph and placement validation
47f3d34 style: redesign the editor with a Blender/CAD interface
3b470c8 fix: stop batched pieces culling out and add CAD proxy models
b11556c feat: add IndexedDB autosave, project files and migration on load
5b28174 feat: derive resource requirements, inventory and construction progress
0bde8e9 feat: add zone system and piece tags
ac8dc76 feat: add blueprint views and measurement system
148d6cb feat: add prefab library with schema v2 migration
ba328c5 feat: add array, mirror and radial pattern tools
793b026 feat: add floor management with ghosting and resource aggregation engine
6f69878 feat: implement P0–P15 foundation and playable 3D editor
```

This handoff (models loader, licensing, docs) is the commit immediately after
`3190064`.
