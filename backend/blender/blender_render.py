"""
Blender Synthetic Data Pipeline
PDF Phase 2, Steps 7-8

Run headlessly:
  blender --background --python blender_render.py -- \
    --jacket  path/to/jacket.glb \
    --smpl    path/to/basicmodel_neutral_lbs_10_207_0_v1.1.0.pkl \
    --fabrics path/to/fabrics/ \
    --hdris   path/to/hdris/ \
    --output  path/to/output/ \
    --count   50000

Output per sample (matches train_vton.py exactly):
  person.jpg    <- person WITHOUT jacket
  garment.png   <- jacket only on transparent background
  target.jpg    <- person WITH jacket (ground truth)
  mask.png      <- binary mask of jacket region
"""

import bpy
import sys
import os
import json
import random
import math
import argparse
import pickle
from pathlib import Path

# ─────────────────────────────────────────────────────────
# Extend Python path so Blender can find scipy etc.
# ─────────────────────────────────────────────────────────
sys.path.append(r"C:\Users\tanis\AppData\Roaming\Python\Python311\site-packages")
sys.path.append(r"C:\Program Files\Blender Foundation\Blender 5.0\5.0\python\lib\site-packages")

import numpy as np
from types import ModuleType

# ─────────────────────────────────────────────────────────
# Chumpy mock — must be registered BEFORE any pickle.load
# The key insight: pickle calls cls.__new__(cls) then sets
# __dict__ directly, so __init__ is never called.
# We must handle all attribute access defensively.
# ─────────────────────────────────────────────────────────
class _Ch:
    def __reduce__(self):
        return (_Ch, ())

    def __array__(self, dtype=None):
        data = self.__dict__.get("r", np.array([]))
        if not isinstance(data, np.ndarray):
            try:
                data = np.asarray(data)
            except Exception:
                data = np.array([])
        return data if dtype is None else data.astype(dtype)

    def __call__(self, *a, **kw):
        return self

    def __getattr__(self, name):
        if name == "__dict__":
            raise AttributeError(name)
        obj = object.__new__(_Ch)
        object.__getattribute__(obj, "__dict__")["r"] = np.array([])
        return obj

    def __iter__(self):
        return iter([])

    def __len__(self):
        data = self.__dict__.get("r", np.array([]))
        return len(data) if isinstance(data, np.ndarray) else 0


def _register_chumpy_mock():
    root = ModuleType("chumpy")
    root.Ch = _Ch
    root.array = lambda *a, **kw: _Ch()
    sys.modules["chumpy"] = root
    for sub in ["ch", "ch_ops", "reordering", "utils", "linalg",
                 "context", "logic", "scipy_sparse"]:
        m = ModuleType(f"chumpy.{sub}")
        m.Ch = _Ch
        setattr(root, sub, m)
        sys.modules[f"chumpy.{sub}"] = m

_register_chumpy_mock()


# ─────────────────────────────────────────────────────────
# Robust numpy converter
# ─────────────────────────────────────────────────────────
def _to_np(x):
    """Convert any SMPL pkl value to a plain numpy array."""
    if isinstance(x, np.ndarray):
        return x
    # scipy sparse
    try:
        import scipy.sparse
        if scipy.sparse.issparse(x):
            return x.toarray()
    except Exception:
        pass
    # chumpy Ch — raw data lives in __dict__["r"]
    if isinstance(x, _Ch):
        raw = object.__getattribute__(x, "__dict__").get("r", None)
        if isinstance(raw, np.ndarray):
            return raw
        return np.array([])
    # generic fallback
    try:
        return np.asarray(x)
    except Exception:
        return np.array([])


# ─────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────
def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--jacket",  required=True)
    p.add_argument("--smpl",    required=True)
    p.add_argument("--fabrics", required=True)
    p.add_argument("--hdris",   required=True)
    p.add_argument("--output",  required=True)
    p.add_argument("--count",   type=int, default=50000)
    p.add_argument("--start",   type=int, default=0)
    return p.parse_args(argv)


# ─────────────────────────────────────────────────────────
# Scene helpers
# ─────────────────────────────────────────────────────────
def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:    bpy.data.meshes.remove(block)
    for block in bpy.data.armatures: bpy.data.armatures.remove(block)
    for block in bpy.data.images:    bpy.data.images.remove(block)
    for block in bpy.data.materials: bpy.data.materials.remove(block)


def set_render_settings(w=512, h=768, samples=32):
    s = bpy.context.scene
    s.render.engine                     = "CYCLES"
    s.render.resolution_x               = w
    s.render.resolution_y               = h
    s.cycles.samples                    = samples
    s.render.image_settings.file_format = "PNG"
    s.render.film_transparent           = True


def setup_camera():
    bpy.ops.object.camera_add(location=(0, -4.5, 0.9))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(83), 0, 0)
    cam.location.x += random.uniform(-0.1, 0.1)
    cam.data.lens = 35
    bpy.context.scene.camera = cam


def setup_hdri(hdri_path: str):
    world = bpy.context.scene.world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg  = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    env.image = bpy.data.images.load(hdri_path)
    bg.inputs["Strength"].default_value = random.uniform(0.8, 1.5)
    nt.links.new(env.outputs["Color"],     bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


# ─────────────────────────────────────────────────────────
# SMPL body
# ─────────────────────────────────────────────────────────
def load_smpl_body(smpl_pkl_path: str, shape_params=None):
    print(f"  Loading SMPL: {smpl_pkl_path}")
    with open(smpl_pkl_path, "rb") as f:
        raw = pickle.load(f, encoding="latin1")

    smpl = {k: _to_np(v) for k, v in raw.items()}

    v_template = smpl["v_template"]       # (6890, 3)
    shapedirs  = smpl["shapedirs"]        # (6890, 3, 10)
    faces      = smpl["f"].astype(int)   # (13776, 3)

    if shape_params is None:
        shape_params = np.random.uniform(-1.5, 1.5, 10)

    if (shapedirs.ndim == 3 and
            shapedirs.shape[0] == v_template.shape[0] and
            shapedirs.shape[2] == 10):
        v_shaped = v_template + np.einsum("ijk,k->ij", shapedirs, shape_params)
    else:
        print(f"  ⚠ Unexpected shapedirs shape {shapedirs.shape}, using v_template only")
        v_shaped = v_template.copy()

    v_shaped = v_shaped.astype(np.float64)
    v_shaped *= random.uniform(0.90, 1.10)

    mesh = bpy.data.meshes.new("SMPLBody")
    obj  = bpy.data.objects.new("SMPLBody", mesh)
    bpy.context.collection.objects.link(obj)
    mesh.from_pydata([tuple(v) for v in v_shaped], [], [tuple(f) for f in faces])
    mesh.update()

    mat  = bpy.data.materials.new("SkinMaterial")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        tone = random.uniform(0.25, 0.85)
        bsdf.inputs["Base Color"].default_value = (
            tone, tone * random.uniform(0.7, 0.85),
            tone * random.uniform(0.5, 0.65), 1.0)
        bsdf.inputs["Roughness"].default_value = 0.6
    obj.data.materials.append(mat)

    print(f"  ✔ SMPL body created: {len(v_shaped)} verts")
    return obj, shape_params


# ─────────────────────────────────────────────────────────
# Jacket helpers
# ─────────────────────────────────────────────────────────
def load_jacket(jacket_path: str):
    bpy.ops.import_scene.gltf(filepath=jacket_path)
    objs = list(bpy.context.selected_objects)
    root = bpy.context.active_object
    return root, objs


def fit_jacket_to_body(jacket_root, body_obj):
    if not body_obj or not jacket_root:
        return
    bverts   = [body_obj.matrix_world @ v.co for v in body_obj.data.vertices]
    bxs      = [v.x for v in bverts]
    bzs      = [v.z for v in bverts]
    body_cx  = (max(bxs) + min(bxs)) / 2
    body_top = max(bzs)
    body_mid = (max(bzs) + min(bzs)) / 2
    body_w   = max(bxs) - min(bxs)

    jverts = []
    if jacket_root.type == "MESH":
        jverts = [jacket_root.matrix_world @ v.co for v in jacket_root.data.vertices]
    if not jverts:
        for c in jacket_root.children:
            if c.type == "MESH":
                jverts = [c.matrix_world @ v.co for v in c.data.vertices]
                break

    if jverts:
        jw = max(v.x for v in jverts) - min(v.x for v in jverts)
        sf = (body_w * 1.05) / max(jw, 0.001)
        jacket_root.scale = (sf, sf, sf)

    jacket_root.location.x = body_cx
    jacket_root.location.y = 0.0
    jacket_root.location.z = body_mid + (body_top - body_mid) * 0.15
    bpy.context.view_layer.update()


def apply_fabric_texture(obj, fabric_path: str):
    img = bpy.data.images.load(fabric_path)
    for slot in obj.material_slots:
        mat = slot.material
        if not mat:
            continue
        mat.use_nodes = True
        nt   = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        tex       = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = random.uniform(0.2, 0.95)
        bsdf.inputs["Metallic"].default_value  = random.uniform(0.0, 0.1)


def set_random_pose(armature):
    if not armature or armature.type != "ARMATURE":
        return
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    for bone in armature.pose.bones:
        n = bone.name.lower()
        if any(k in n for k in ["spine", "shoulder", "upper", "neck"]):
            bone.rotation_euler.x = random.uniform(-0.15, 0.15)
            bone.rotation_euler.z = random.uniform(-0.10, 0.10)
    bpy.ops.object.mode_set(mode="OBJECT")


# ─────────────────────────────────────────────────────────
# Render 4 images — filenames match train_vton.py exactly
# ─────────────────────────────────────────────────────────
def render_four_images(output_dir: Path, sample_id: int):
    base = output_dir / f"sample_{sample_id:06d}"
    base.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene

    def _render(path):
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)

    jacket_objs = [o for o in bpy.data.objects
                   if "jacket" in o.name.lower() and o.type == "MESH"]
    body_objs   = [o for o in bpy.data.objects
                   if o.type == "MESH" and o not in jacket_objs]

    if not body_objs:
        print("  ⚠ WARNING: No body mesh in scene!")
    if not jacket_objs:
        print("  ⚠ WARNING: No jacket mesh in scene!")

    # 1. person.jpg
    for o in jacket_objs: o.hide_render = True
    for o in body_objs:   o.hide_render = False
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality     = 95
    _render(base / "person.jpg")

    # 2. target.jpg
    for o in jacket_objs: o.hide_render = False
    _render(base / "target.jpg")

    # 3. garment.png
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode  = "RGBA"
    for o in body_objs:   o.hide_render = True
    for o in jacket_objs: o.hide_render = False
    _render(base / "garment.png")

    # 4. mask.png
    for o in jacket_objs:
            white_mat = bpy.data.materials.new(name="MaskMat")
            white_mat.use_nodes = True
            nt = white_mat.node_tree
            nt.nodes.clear()
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            em  = nt.nodes.new("ShaderNodeEmission")
            em.inputs["Color"].default_value    = (1, 1, 1, 1)
            em.inputs["Strength"].default_value = 1.0
            nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
            for slot in o.material_slots:
                slot.material = white_mat

    scene.render.image_settings.color_mode = "BW"
    for o in body_objs:   o.hide_render = True
    for o in jacket_objs: o.hide_render = False
    _render(base / "mask.png")
    scene.render.image_settings.color_mode = "RGBA"
    return base


def export_metadata(base, sample_id, fabric_name, hdri_name, seed, shape_params):
    meta = {
        "sample_id":    sample_id,
        "fabric":       fabric_name,
        "hdri":         hdri_name,
        "pose_seed":    seed,
        "shape_params": shape_params.tolist(),
        "images": {
            "person":  "person.jpg",
            "garment": "garment.png",
            "target":  "target.jpg",
            "mask":    "mask.png",
        }
    }
    with open(base / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)


# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────
def main():
    args = parse_args()

    fabric_list = (sorted(Path(args.fabrics).glob("*.jpg")) +
                   sorted(Path(args.fabrics).glob("*.png")))
    hdri_list   = (sorted(Path(args.hdris).glob("*.hdr")) +
                   sorted(Path(args.hdris).glob("*.exr")))

    if not fabric_list:
        raise FileNotFoundError(f"No fabric images in {args.fabrics}")
    if not hdri_list:
        raise FileNotFoundError(f"No HDRI files in {args.hdris}")

    print(f"Fabrics found : {len(fabric_list)}")
    print(f"HDRIs found   : {len(hdri_list)}")
    print(f"SMPL model    : {args.smpl}")
    print(f"Rendering {args.count} samples starting at {args.start}...")

    set_render_settings()

    for i in range(args.start, args.start + args.count):
        print(f"\n-- Sample {i} --")
        random.seed(i)
        np.random.seed(i)

        fabric_path = random.choice(fabric_list)
        hdri_path   = random.choice(hdri_list)

        clear_scene()
        setup_hdri(str(hdri_path))
        setup_camera()

        jacket_root, jacket_objs = load_jacket(args.jacket)
        shape_params = np.random.uniform(-1.5, 1.5, 10)  # kept for metadata only
        set_random_pose(next((o for o in jacket_objs if o.type == "ARMATURE"), None))

        for obj in jacket_objs:
            if obj.type == "MESH":
                apply_fabric_texture(obj, str(fabric_path))

        base = render_four_images(Path(args.output), i)
        export_metadata(base, i, fabric_path.stem, hdri_path.stem, i, shape_params)
        print(f"  + Sample {i} -> {base}")

    print(f"\nDone. {args.count} samples in {args.output}")


if __name__ == "__main__":
    main()