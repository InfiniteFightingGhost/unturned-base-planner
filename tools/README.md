# Unturned asset extraction tools

These scripts turn the Unturned assets already installed on **this machine** into
models and data for the planner. They are development-time tools; the app never
runs them at runtime.

## Legal / distribution

The extracted `.obj` files are derived from the user's own locally-installed copy
of Unturned and are intended **for personal use only**. They are **not**
redistributed: the OBJ files are git-ignored and must never be committed. Only
`public/models/manifest.json` (numbers and paths, no game art) and
`src/data/generated/game-definitions.json` (parsed text data) are kept in the
repository.

## Requirements

- Python with [UnityPy](https://github.com/K0lb3/UnityPy) (verified with 1.25.4):
  `/home/andy/.pyenv/versions/3.10.19/bin/python`
- Node.js (verified with v25)

## Commands

```bash
# 1. Models: exports public/models/<id>.obj + public/models/manifest.json
/home/andy/.pyenv/versions/3.10.19/bin/python tools/extract_unturned_models.py
# re-export everything (otherwise up-to-date files are skipped):
/home/andy/.pyenv/versions/3.10.19/bin/python tools/extract_unturned_models.py --force
# restrict to a few ids:
/home/andy/.pyenv/versions/3.10.19/bin/python tools/extract_unturned_models.py \
    --only wall.birch,floor.maple,pillar.brick --force

# 2. Data: writes src/data/generated/game-definitions.json
node tools/extract_unturned_data.mjs
```

Both accept `--bundle` / `--items` / `--out` style overrides; the model script
uses `--bundle`, `--items`, `--out`, the data script uses `--items`, `--out`.

## Inputs

- Bundle: `.../Unturned/Bundles/core_linux.masterbundle`
- Definitions: `.../Unturned/Bundles/Items/Structures/<Piece>_<Tier>/` and
  `.../Unturned/Bundles/Items/Barricades/<Name>/` (`.dat` + `English.dat`)

## ID mapping

Models are keyed by a stable definition id derived from the asset folder name:

| Folder | Id |
| --- | --- |
| `Wall_Birch` | `wall.birch` |
| `Floor_Maple` | `floor.maple` |
| `Wall_Ramp_Birch` | `wall_ramp.birch` |
| `Roof_Pine_Triangle` | `roof.pine.triangle` |
| `Hole_Brick_Triangle` | `hole.brick.triangle` |
| `Door_Birch` (barricade) | `door.birch` |

Structures: strip the trailing `_<Tier>` (and `_Triangle`), lowercase the piece
name while keeping underscores, then append the tier and `.triangle`.
Barricades: lowercase the folder name and replace `_` with `.`.

## Normalisation

1. The LOD0 mesh is selected from `LODGroup.m_LODs[0]`; when there is no
   LODGroup, the mesh with the most vertices across the prefab hierarchy is used
   (`SkinnedMeshRenderer` meshes are supported for hinged barricades such as
   doors). Multiple LOD0 renderers are merged.
2. Prefab child transforms below the root are baked. The root's stored transform
   (a stray world position and the authoring rotation) is discarded, because the
   game overwrites it at spawn time.
3. The Z-up authored mesh is rotated into **Y-up** by baking the game's spawn
   rotation of `-90°` about X: `(x, y, z) -> (x, z, -y)`.
4. The pivot is moved to **base-centre**: `min(Y) = 0`, X and Z centred.
5. `1` Unity unit `= 1` metre; no rescaling is applied.

### Note on real asset bounds

LOD0 meshes include decorative geometry and the vanilla floor/foundation pieces
carry a long downward "ground-fill" skirt. Consequently the raw mesh bounds can
exceed the structural footprint declared by the prefab's `BoxCollider`:

- `wall.birch`: mesh `5.6 × 4.25 × 0.71` (LOD0 trim); collider `5.5 × 4.25 × 0.5`.
- `floor.birch`: mesh `6 × 10.25 × 6` (includes the skirt); collider `6 × 6 × 10.25`.
- `roof.birch`: mesh `6 × 0.5 × 6` exactly.

Orientation and pivot are correct in all cases (vertical axis is Y, base at 0).
