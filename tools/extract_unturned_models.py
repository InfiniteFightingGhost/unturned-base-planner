#!/usr/bin/env python3
"""Extract Unturned structure/barricade meshes from the local game install.

Reads the local ``core_linux.masterbundle`` with UnityPy, selects the LOD0
mesh for every structure (``Structure.prefab``) and barricade
(``Barricade.prefab``) container, bakes the prefab child transforms, rotates the
Z-up authored geometry into Y-up (the game's spawn rotation of -90 deg about X),
normalises the pivot to base-centre, and writes ``public/models/<id>.obj`` plus a
small ``public/models/manifest.json``.

The exported OBJ files are generated locally from the user's own game install
for personal use and are NOT redistributed (see tools/README.md).
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import UnityPy
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write(
        "UnityPy is required. Install with:\n"
        "  pip3 install --user UnityPy\n"
    )
    raise

DEFAULT_BUNDLE = (
    "/home/andy/.local/share/Steam/steamapps/common/Unturned/Bundles/"
    "core_linux.masterbundle"
)
DEFAULT_ITEMS = "/home/andy/.local/share/Steam/steamapps/common/Unturned/Bundles/Items"

# Unity bundle container prefixes (env.container keys are lowercased).
STRUCT_PREFIX = "assets/coremasterbundle/items/structures/"
BARRICADE_PREFIX = "assets/coremasterbundle/items/barricades/"

# The game spawns structures/barricades with a -90 deg rotation about X; meshes
# are authored Z-up, so baking this yields Y-up. (x, y, z) -> (x, z, -y).
RX_NEG90 = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, -1.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
]

IDENTITY = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
]


# --------------------------------------------------------------------------- #
# small 4x4 matrix helpers (row-major, 16 floats)
# --------------------------------------------------------------------------- #
def mat_mul(a: Sequence[float], b: Sequence[float]) -> List[float]:
    out = [0.0] * 16
    for r in range(4):
        for c in range(4):
            out[r * 4 + c] = (
                a[r * 4 + 0] * b[0 * 4 + c]
                + a[r * 4 + 1] * b[1 * 4 + c]
                + a[r * 4 + 2] * b[2 * 4 + c]
                + a[r * 4 + 3] * b[3 * 4 + c]
            )
    return out


def transform_point(m: Sequence[float], p: Tuple[float, float, float]) -> Tuple[float, float, float]:
    x, y, z = p
    return (
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
    )


def transform_dir(m: Sequence[float], p: Tuple[float, float, float]) -> Tuple[float, float, float]:
    x, y, z = p
    return (
        m[0] * x + m[1] * y + m[2] * z,
        m[4] * x + m[5] * y + m[6] * z,
        m[8] * x + m[9] * y + m[10] * z,
    )


def local_matrix(transform) -> List[float]:
    """Build a TRS matrix from a UnityPy Transform (Unity convention)."""
    pos = transform.m_LocalPosition
    rot = transform.m_LocalRotation
    scale = transform.m_LocalScale

    x, y, z, w = float(rot.x), float(rot.y), float(rot.z), float(rot.w)
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z

    r = [
        1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0.0,
        2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0.0,
        2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]
    sx, sy, sz = float(scale.x), float(scale.y), float(scale.z)
    r[0] *= sx; r[1] *= sy; r[2] *= sz
    r[4] *= sx; r[5] *= sy; r[6] *= sz
    r[8] *= sx; r[9] *= sy; r[10] *= sz
    r[3] = float(pos.x)
    r[7] = float(pos.y)
    r[11] = float(pos.z)
    return r


# --------------------------------------------------------------------------- #
# OBJ parsing / writing
# --------------------------------------------------------------------------- #
class ObjData:
    __slots__ = ("v", "vt", "vn", "faces")

    def __init__(self) -> None:
        self.v: List[Tuple[float, float, float]] = []
        self.vt: List[Tuple[float, ...]] = []
        self.vn: List[Tuple[float, float, float]] = []
        self.faces: List[List[Optional[Tuple[Optional[int], Optional[int], Optional[int]]]]] = []


def parse_obj(text: str) -> ObjData:
    data = ObjData()
    for line in text.splitlines():
        if not line:
            continue
        if line.startswith("v "):
            parts = line.split()
            data.v.append((float(parts[1]), float(parts[2]), float(parts[3])))
        elif line.startswith("vt "):
            data.vt.append(tuple(float(x) for x in line.split()[1:]))
        elif line.startswith("vn "):
            parts = line.split()
            data.vn.append((float(parts[1]), float(parts[2]), float(parts[3])))
        elif line.startswith("f "):
            face: List[Optional[Tuple[Optional[int], Optional[int], Optional[int]]]] = []
            for token in line.split()[1:]:
                bits = token.split("/")
                vi = int(bits[0]) if bits[0] else None
                ti = int(bits[1]) if len(bits) > 1 and bits[1] else None
                ni = int(bits[2]) if len(bits) > 2 and bits[2] else None
                face.append((vi, ti, ni))
            if face:
                data.faces.append(face)
    return data


def merge_obj(parts: Sequence[ObjData]) -> ObjData:
    merged = ObjData()
    for part in parts:
        vo = len(merged.v)
        to = len(merged.vt)
        no = len(merged.vn)
        merged.v.extend(part.v)
        merged.vt.extend(part.vt)
        merged.vn.extend(part.vn)
        for face in part.faces:
            out_face = []
            for (vi, ti, ni) in face:
                out_face.append(
                    (
                        vi + vo if vi is not None else None,
                        ti + to if ti is not None else None,
                        ni + no if ni is not None else None,
                    )
                )
            merged.faces.append(out_face)
    return merged


def _fmt(value: float) -> str:
    s = f"{value:.6f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


def write_obj(
    obj: ObjData,
    out_path: Path,
    matrix: Sequence[float],
    source: str,
) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    """Transform, base-centre, and write an OBJ. Returns (min, max) bounds."""
    verts = [transform_point(matrix, v) for v in obj.v]
    if not verts:
        raise ValueError("mesh has no vertices")

    min_x = min(v[0] for v in verts)
    max_x = max(v[0] for v in verts)
    min_y = min(v[1] for v in verts)
    max_y = max(v[1] for v in verts)
    min_z = min(v[2] for v in verts)
    max_z = max(v[2] for v in verts)
    cx = (min_x + max_x) / 2.0
    cz = (min_z + max_z) / 2.0
    verts = [(v[0] - cx, v[1] - min_y, v[2] - cz) for v in verts]

    min_x = min(v[0] for v in verts)
    max_x = max(v[0] for v in verts)
    min_y = min(v[1] for v in verts)
    max_y = max(v[1] for v in verts)
    min_z = min(v[2] for v in verts)
    max_z = max(v[2] for v in verts)

    lines: List[str] = [
        "# Generated locally from Unturned assets (personal use only).",
        f"# source: {source}",
        "# pivot: base-center  up: Y",
    ]
    for v in verts:
        lines.append(f"v {_fmt(v[0])} {_fmt(v[1])} {_fmt(v[2])}")
    for vt in obj.vt:
        lines.append("vt " + " ".join(_fmt(c) for c in vt))
    for vn in obj.vn:
        d = transform_dir(matrix, vn)
        length = math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) or 1.0
        lines.append(
            "vn " + " ".join(_fmt(c / length) for c in d)
        )
    for face in obj.faces:
        tokens = []
        for (vi, ti, ni) in face:
            if vi is None:
                tokens.append("0")
                continue
            if ti is None and ni is None:
                tokens.append(str(vi))
            else:
                tokens.append(
                    f"{vi}/{ti if ti is not None else ''}/{ni if ni is not None else ''}"
                )
        lines.append("f " + " ".join(tokens))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return (min_x, min_y, min_z), (max_x, max_y, max_z)


# --------------------------------------------------------------------------- #
# Unity object helpers
# --------------------------------------------------------------------------- #
def iter_components(game_object) -> Iterable:
    for pair in getattr(game_object, "m_Component", []) or []:
        comp = getattr(pair, "component", None)
        if comp is None:
            try:
                comp = pair[1]
            except Exception:
                continue
        try:
            yield comp.read()
        except Exception:
            continue


def get_component(game_object, type_name: str):
    for comp in iter_components(game_object):
        if type(comp).__name__ == type_name:
            return comp
    return None


def mesh_from_game_object(game_object):
    """Return the first mesh found on this GameObject, if any."""
    mf = get_component(game_object, "MeshFilter")
    if mf is not None:
        try:
            return mf.m_Mesh.read()
        except Exception:
            pass
    smr = get_component(game_object, "SkinnedMeshRenderer")
    if smr is not None:
        try:
            return smr.m_Mesh.read()
        except Exception:
            pass
    return None


def child_chain_matrix(mesh_game_object, root_game_object) -> List[float]:
    """Local transform of every GameObject below root, accumulated.

    The prefab root's own local transform is deliberately excluded: the game
    overwrites it with the spawn rotation (baked separately as RX_NEG90).
    """
    transform = get_component(mesh_game_object, "Transform")
    locals_: List[List[float]] = []
    while transform is not None:
        is_root = _same_object(transform.m_GameObject.read(), root_game_object)
        father = getattr(transform, "m_Father", None)
        father_null = father is None or getattr(father, "m_PathID", 0) == 0
        if not is_root:
            locals_.append(local_matrix(transform))
        if is_root or father_null:
            break
        try:
            transform = father.read()
        except Exception:
            break

    matrix = IDENTITY
    for m in reversed(locals_):
        matrix = mat_mul(matrix, m)
    return matrix


def _same_object(a, b) -> bool:
    if a is b:
        return True
    na = getattr(a, "m_Name", None)
    nb = getattr(b, "m_Name", None)
    return na is not None and na == nb


def iter_descendants(game_object) -> Iterable:
    transform = get_component(game_object, "Transform")
    if transform is None:
        return
    for child_ptr in getattr(transform, "m_Children", []) or []:
        try:
            child_go = child_ptr.read().m_GameObject.read()
        except Exception:
            continue
        yield child_go
        yield from iter_descendants(child_go)


def lod0_mesh_objects(root) -> List:
    """Return mesh-bearing GameObjects for LOD0, or [] when no LODGroup."""
    lod_group = get_component(root, "LODGroup")
    if lod_group is None:
        return []
    lods = getattr(lod_group, "m_LODs", None)
    if not lods:
        return []
    result = []
    for lod_renderer in getattr(lods[0], "renderers", []) or []:
        try:
            renderer = lod_renderer.renderer.read()
            go = renderer.m_GameObject.read()
        except Exception:
            continue
        if mesh_from_game_object(go) is not None:
            result.append(go)
    return result


def all_mesh_objects(root) -> List:
    found = []
    if mesh_from_game_object(root) is not None:
        found.append(root)
    for go in iter_descendants(root):
        if mesh_from_game_object(go) is not None:
            found.append(go)
    return found


def mesh_vertex_count(mesh) -> int:
    try:
        return sum(1 for line in mesh.export().splitlines() if line.startswith("v "))
    except Exception:
        return 0


# --------------------------------------------------------------------------- #
# id mapping
# --------------------------------------------------------------------------- #
TIERS = {"birch", "maple", "pine", "brick", "metal"}


def structure_definition_id(dir_name: str) -> str:
    """``Wall_Ramp_Birch`` -> ``wall_ramp.birch``; ``Roof_Pine_Triangle`` ->
    ``roof.pine.triangle``."""
    is_tri = dir_name.endswith("_Triangle")
    base = dir_name[: -len("_Triangle")] if is_tri else dir_name
    parts = base.split("_")
    tier = parts[-1].lower()
    piece = "_".join(parts[:-1]).lower()
    definition_id = f"{piece}.{tier}"
    return definition_id + ".triangle" if is_tri else definition_id


def barricade_definition_id(dir_name: str) -> str:
    """``Door_Birch`` -> ``door.birch`` (folder name lowercased, ``_`` -> ``.``)."""
    return dir_name.lower().replace("_", ".")


# --------------------------------------------------------------------------- #
# .dat reading (lightweight, for names/types)
# --------------------------------------------------------------------------- #
DAT_FIELD = re.compile(r"^\ufeff?\s*([A-Za-z_][A-Za-z0-9_]*)\s+(.*?)\s*$")


def read_dat_fields(path: Path) -> Dict[str, str]:
    fields: Dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return fields
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        match = DAT_FIELD.match(line)
        if match and not stripped.startswith(("[", "]", "{")):
            key = match.group(1)
            if key not in fields:
                fields[key] = match.group(2).strip().strip('"')
    return fields


def read_english_name(directory: Path) -> Optional[str]:
    for candidate in ("English.dat", "english.dat"):
        path = directory / candidate
        if path.exists():
            fields = read_dat_fields(path)
            return fields.get("Name")
    return None


def piece_dat(directory: Path, stem: str) -> Optional[Path]:
    path = directory / f"{stem}.dat"
    if path.exists():
        return path
    for candidate in directory.glob("*.dat"):
        if candidate.name.lower() == "english.dat":
            continue
        return candidate
    return None


# --------------------------------------------------------------------------- #
# discovery
# --------------------------------------------------------------------------- #
class Entry:
    def __init__(
        self,
        definition_id: str,
        container_key: str,
        kind: str,
        source_dir: Optional[Path],
        stem: str,
    ) -> None:
        self.definition_id = definition_id
        self.container_key = container_key
        self.kind = kind
        self.source_dir = source_dir
        self.stem = stem
        self.game_type: Optional[str] = None
        self.construct: Optional[str] = None
        self.build: Optional[str] = None
        self.name: Optional[str] = None

    def load_dat(self) -> None:
        if self.source_dir is None:
            return
        path = piece_dat(self.source_dir, self.stem)
        if path is None:
            return
        fields = read_dat_fields(path)
        self.game_type = fields.get("Type")
        self.construct = fields.get("Construct")
        self.build = fields.get("Build")
        self.name = read_english_name(self.source_dir)


def discover_structure_entries(env, items_dir: Path) -> Dict[str, Entry]:
    entries: Dict[str, Entry] = {}
    fs_dirs = {}
    structures_dir = items_dir / "Structures"
    if structures_dir.is_dir():
        for d in sorted(structures_dir.iterdir()):
            if d.is_dir():
                fs_dirs[d.name.lower()] = d
    for key in env.container:
        if not key.startswith(STRUCT_PREFIX) or not key.endswith("/structure.prefab"):
            continue
        name = key[len(STRUCT_PREFIX) : -len("/structure.prefab")]
        if "/" in name or not name:
            continue
        source_dir = fs_dirs.get(name)
        stem = source_dir.name if source_dir is not None else name
        definition_id = structure_definition_id(stem)
        entry = Entry(definition_id, key, "structure", source_dir, stem)
        entry.load_dat()
        entries[definition_id] = entry
    return entries


def discover_barricade_entries(env, items_dir: Path) -> Dict[str, Entry]:
    entries: Dict[str, Entry] = {}
    fs_dirs = {}
    barricades_dir = items_dir / "Barricades"
    if barricades_dir.is_dir():
        for d in sorted(barricades_dir.iterdir()):
            if d.is_dir():
                fs_dirs[d.name.lower()] = d
    for key in env.container:
        if not key.startswith(BARRICADE_PREFIX) or not key.endswith("/barricade.prefab"):
            continue
        name = key[len(BARRICADE_PREFIX) : -len("/barricade.prefab")]
        if "/" in name or not name:
            continue
        source_dir = fs_dirs.get(name)
        stem = source_dir.name if source_dir is not None else name
        definition_id = barricade_definition_id(stem)
        entry = Entry(definition_id, key, "barricade", source_dir, stem)
        entry.load_dat()
        entries[definition_id] = entry
    return entries


# --------------------------------------------------------------------------- #
# extraction
# --------------------------------------------------------------------------- #
def extract_entry(env, entry: Entry, out_dir: Path, force: bool, bundle_mtime: float):
    """Return (status, record_or_message)."""
    out_path = out_dir / f"{entry.definition_id}.obj"
    source_note = f"{entry.kind} {entry.stem}"
    if entry.name:
        source_note += f" ({entry.name})"

    if out_path.exists() and not force and out_path.stat().st_mtime >= bundle_mtime:
        try:
            record, _ = load_existing_bounds(out_path)
            return "skipped", record
        except Exception:
            pass  # fall through and re-export a corrupt/stale file

    try:
        root = env.container[entry.container_key].read()
    except Exception as exc:  # pragma: no cover
        return "failed", f"container read failed: {exc}"

    mesh_objects = lod0_mesh_objects(root)
    if not mesh_objects:
        candidates = all_mesh_objects(root)
        if candidates:
            candidates.sort(key=lambda go: mesh_vertex_count(mesh_from_game_object(go)), reverse=True)
            mesh_objects = [candidates[0]]
    if not mesh_objects:
        return "no-mesh", "no MeshFilter/SkinnedMeshRenderer in prefab"

    parts: List[ObjData] = []
    matrix = IDENTITY
    for go in mesh_objects:
        mesh = mesh_from_game_object(go)
        if mesh is None:
            continue
        try:
            exported = mesh.export()
        except Exception as exc:
            return "failed", f"mesh export failed: {exc}"
        parts.append(parse_obj(exported))
        # Child transform of the first mesh (all share the same parent chain in
        # practice); applied uniformly after merging as a single prefab frame.
        matrix = child_chain_matrix(go, root)

    if not parts:
        return "no-mesh", "meshes found but none exported"

    merged = merge_obj(parts)
    final_matrix = mat_mul(RX_NEG90, matrix)
    try:
        bounds_min, bounds_max = write_obj(merged, out_path, final_matrix, source_note)
    except Exception as exc:
        return "failed", f"write failed: {exc}"

    record = {
        "file": f"models/{entry.definition_id}.obj",
        "pivot": "base-center",
        "up": "Y",
        "bounds": {
            "min": [round(x, 6) for x in bounds_min],
            "max": [round(x, 6) for x in bounds_max],
        },
    }
    return "exported", record


def load_existing_bounds(path: Path):
    obj = parse_obj(path.read_text(encoding="utf-8", errors="replace"))
    if not obj.v:
        raise ValueError("empty obj")
    min_x = min(v[0] for v in obj.v); max_x = max(v[0] for v in obj.v)
    min_y = min(v[1] for v in obj.v); max_y = max(v[1] for v in obj.v)
    min_z = min(v[2] for v in obj.v); max_z = max(v[2] for v in obj.v)
    return {
        "file": f"models/{path.stem}.obj",
        "pivot": "base-center",
        "up": "Y",
        "bounds": {
            "min": [round(min_x, 6), round(min_y, 6), round(min_z, 6)],
            "max": [round(max_x, 6), round(max_y, 6), round(max_z, 6)],
        },
    }, ((min_x, min_y, min_z), (max_x, max_y, max_z))


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
SAMPLE_IDS = [
    "wall.birch",
    "floor.birch",
    "pillar.birch",
    "roof.birch",
    "wall_ramp.birch",
    "door.birch",
]


def bounds_str(bounds) -> str:
    (mn, mx) = bounds
    dims = tuple(round(mx[i] - mn[i], 3) for i in range(3))
    return (
        f"x[{mn[0]:.3f},{mx[0]:.3f}] y[{mn[1]:.3f},{mx[1]:.3f}] z[{mn[2]:.3f},{mx[2]:.3f}]"
        f" dims={dims}"
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", default=DEFAULT_BUNDLE)
    parser.add_argument("--items", default=DEFAULT_ITEMS)
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent.parent / "public" / "models"),
    )
    parser.add_argument("--force", action="store_true", help="re-export every model")
    parser.add_argument(
        "--only",
        default=None,
        help="comma-separated definition ids to restrict extraction to",
    )
    args = parser.parse_args(argv)

    bundle_path = Path(args.bundle)
    items_dir = Path(args.items)
    out_dir = Path(args.out)
    if not bundle_path.exists():
        sys.stderr.write(f"bundle not found: {bundle_path}\n")
        return 2
    if not items_dir.is_dir():
        sys.stderr.write(f"items dir not found: {items_dir}\n")
        return 2

    only = None
    if args.only:
        only = {part.strip() for part in args.only.split(",") if part.strip()}

    print(f"loading bundle {bundle_path} ...", flush=True)
    env = UnityPy.load(str(bundle_path))
    print(f"  container entries: {len(env.container)}")

    structures = discover_structure_entries(env, items_dir)
    barricades = discover_barricade_entries(env, items_dir)

    # detect id collisions across the two families
    collisions = set(structures) & set(barricades)
    if collisions:
        print(f"  WARNING: {len(collisions)} id collisions ignored: {sorted(collisions)[:5]}")

    entries: List[Entry] = [e for e in structures.values() if e.definition_id not in collisions]
    entries += [e for e in barricades.values() if e.definition_id not in collisions]
    entries.sort(key=lambda e: e.definition_id)
    if only is not None:
        entries = [e for e in entries if e.definition_id in only]

    bundle_mtime = bundle_path.stat().st_mtime
    manifest_models: Dict[str, dict] = {}
    counts = {"exported": 0, "skipped": 0, "failed": 0, "no-mesh": 0}
    failures: List[str] = []
    no_mesh: List[str] = []
    sample_bounds: Dict[str, tuple] = {}

    for entry in entries:
        status, payload = extract_entry(env, entry, out_dir, args.force, bundle_mtime)
        counts[status] += 1
        if status in ("exported", "skipped"):
            manifest_models[entry.definition_id] = payload
            if entry.definition_id in SAMPLE_IDS:
                obj = out_dir / f"{entry.definition_id}.obj"
                _, bounds = load_existing_bounds(obj)
                sample_bounds[entry.definition_id] = bounds
        elif status == "no-mesh":
            no_mesh.append(entry.definition_id)
        else:
            failures.append(f"{entry.definition_id}: {payload}")

    manifest = {
        "version": 1,
        "source": "local-unturned",
        "models": dict(sorted(manifest_models.items())),
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )

    print("")
    print("=== sample bounds (Y-up, base-center pivot) ===")
    for definition_id in SAMPLE_IDS:
        if definition_id in sample_bounds:
            print(f"  {definition_id:20s} {bounds_str(sample_bounds[definition_id])}")
    print("")
    print("=== summary ===")
    print(f"  structures discovered : {len(structures)}")
    print(f"  barricades discovered : {len(barricades)}")
    print(f"  exported              : {counts['exported']}")
    print(f"  skipped (up to date)  : {counts['skipped']}")
    print(f"  failed                : {counts['failed']}")
    print(f"  no mesh               : {counts['no-mesh']}")
    print(f"  manifest              : {manifest_path} ({len(manifest_models)} models)")
    if no_mesh:
        print("  pieces without a mesh:")
        for definition_id in no_mesh:
            print(f"    - {definition_id}")
    if failures:
        print("  failures:")
        for line in failures:
            print(f"    - {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
