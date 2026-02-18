"""
Blender Synthetic Data Pipeline
PDF Phase 2, Steps 7-8

Run headlessly:
  blender --background --python blender_render.py -- \
    --jacket path/to/jacket.glb \
    --fabrics path/to/fabrics/ \
    --hdris   path/to/hdris/ \
    --output  path/to/output/ \
    --count   50000

Step 7: Loads SMPL body → fits jacket → random fabric → random HDRI → renders
Step 8: Produces 4 images per sample + metadata JSON
"""

import bpy
import sys
import os
import json
import random
import math
import argparse
import numpy as np
from pathlib import Path


# ─────────────────────────────────────────────────────────
# Argument parsing  (everything after '--' is for our script)
# ─────────────────────────────────────────────────────────
def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser()
    parser.add_argument("--jacket",  required=True,  help="Path to jacket.glb")
    parser.add_argument("--smpl",    required=True,  help="Path to SMPL .pkl or .fbx")
    parser.add_argument("--fabrics", required=True,  help="Folder of fabric images")
    parser.add_argument("--hdris",   required=True,  help="Folder of .hdr/.exr files")
    parser.add_argument("--output",  required=True,  help="Output folder")
    parser.add_argument("--count",   type=int, default=50000)
    parser.add_argument("--start",   type=int, default=0, help="Resume from sample N")
    return parser.parse_args(argv)


# ─────────────────────────────────────────────────────────
# Scene helpers
# ─────────────────────────────────────────────────────────
def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:     bpy.data.meshes.remove(block)
    for block in bpy.data.armatures:  bpy.data.armatures.remove(block)
    for block in bpy.data.images:     bpy.data.images.remove(block)
    for block in bpy.data.materials:  bpy.data.materials.remove(block)


def set_render_settings(w=512, h=768, samples=32):
    """Step 7: Front-facing camera, portrait render."""
    scene = bpy.context.scene
    scene.render.engine         = "CYCLES"
    scene.render.resolution_x   = w
    scene.render.resolution_y   = h
    scene.cycles.samples         = samples
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True          # transparent BG


def setup_camera():
    bpy.ops.object.camera_add(location=(0, -3.5, 1.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    # Slight random variation (Step 7)
    cam.location.x += random.uniform(-0.1, 0.1)
    cam.location.y += random.uniform(-0.2, 0.2)
    cam.location.z += random.uniform(-0.05, 0.1)
    bpy.context.scene.camera = cam
    return cam


def setup_hdri(hdri_path: str):
    """Step 7: Random HDRI lighting."""
    world = bpy.context.scene.world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()

    bg   = nt.nodes.new("ShaderNodeBackground")
    env  = nt.nodes.new("ShaderNodeTexEnvironment")
    out  = nt.nodes.new("ShaderNodeOutputWorld")
    env.image = bpy.data.images.load(hdri_path)
    bg.inputs["Strength"].default_value = random.uniform(0.8, 1.5)

    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def load_jacket(jacket_path: str):
    """Load the rigged jacket GLB."""
    bpy.ops.import_scene.gltf(filepath=jacket_path)
    jacket_objects = [o for o in bpy.context.selected_objects]
    jacket_root    = bpy.context.active_object
    return jacket_root, jacket_objects


def apply_fabric_texture(obj, fabric_path: str):
    """Step 7: Apply random fabric texture to the jacket mesh."""
    img = bpy.data.images.load(fabric_path)

    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        mat.use_nodes = True
        nt  = mat.node_tree
        # Find or create Principled BSDF
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")

        tex  = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

        # Roughness variation based on fabric type
        bsdf.inputs["Roughness"].default_value = random.uniform(0.2, 0.95)
        bsdf.inputs["Metallic"].default_value  = random.uniform(0.0, 0.1)


def set_random_smpl_pose(armature):
    """
    Step 7: Random SMPL body shape params.
    In a full implementation, load SMPL .pkl shape coefficients.
    Here we randomise bone rotations on the rig as a proxy.
    """
    if armature is None or armature.type != "ARMATURE":
        return

    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")

    for bone in armature.pose.bones:
        name = bone.name.lower()
        # Small random rotations to vary pose naturally
        if any(k in name for k in ["spine", "shoulder", "upper", "neck"]):
            bone.rotation_euler.x = random.uniform(-0.15, 0.15)
            bone.rotation_euler.z = random.uniform(-0.10, 0.10)

    bpy.ops.object.mode_set(mode="OBJECT")


def render_four_images(output_dir: Path, sample_id: int):
    """
    Step 8: Render 4 images per sample.
      1. person_only   – base clothing, jacket hidden
      2. with_jacket   – ground truth (jacket visible)
      3. jacket_only   – jacket on transparent background, no body
      4. mask          – binary segmentation of jacket (white = jacket)
    """
    base = output_dir / f"sample_{sample_id:06d}"
    base.mkdir(parents=True, exist_ok=True)

    scene = bpy.context.scene

    def _render(path):
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)

    jacket_objs = [o for o in bpy.data.objects if "jacket" in o.name.lower()]
    body_objs   = [o for o in bpy.data.objects
                   if o.type == "MESH" and o not in jacket_objs]

    # 1. person_only
    for o in jacket_objs: o.hide_render = True
    for o in body_objs:   o.hide_render = False
    _render(base / "person_only.png")

    # 2. with_jacket (ground truth)
    for o in jacket_objs: o.hide_render = False
    _render(base / "with_jacket.png")

    # 3. jacket_only (transparent BG, no body)
    for o in body_objs: o.hide_render = True
    _render(base / "jacket_only.png")

    # 4. mask — emit white from jacket, black background
    for o in jacket_objs:
        for slot in o.material_slots:
            if slot.material:
                slot.material.use_nodes = True
                nt  = slot.material.node_tree
                out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
                em  = nt.nodes.new("ShaderNodeEmission")
                em.inputs["Color"].default_value = (1, 1, 1, 1)
                nt.links.new(em.outputs["Emission"], out.inputs["Surface"])

    for o in body_objs:   o.hide_render = True
    for o in jacket_objs: o.hide_render = False
    _render(base / "mask.png")

    # Restore materials after mask render (simple: just reload on next iteration)

    return base


def export_metadata(base: Path, sample_id: int, fabric_name: str,
                    hdri_name: str, pose_seed: int):
    """Step 8: Save metadata JSON."""
    meta = {
        "sample_id":   sample_id,
        "fabric":      fabric_name,
        "hdri":        hdri_name,
        "pose_seed":   pose_seed,
        "images": {
            "person_only":  "person_only.png",
            "with_jacket":  "with_jacket.png",
            "jacket_only":  "jacket_only.png",
            "mask":         "mask.png",
        }
    }
    with open(base / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)


# ─────────────────────────────────────────────────────────
# Main loop
# ─────────────────────────────────────────────────────────
def main():
    args = parse_args()

    output_dir  = Path(args.output)
    fabric_list = sorted(Path(args.fabrics).glob("*.jpg")) + \
                  sorted(Path(args.fabrics).glob("*.png"))
    hdri_list   = sorted(Path(args.hdris).glob("*.hdr"))  + \
                  sorted(Path(args.hdris).glob("*.exr"))

    print(f"Fabrics found: {len(fabric_list)}")
    print(f"HDRIs found:   {len(hdri_list)}")
    print(f"Rendering {args.count} samples starting at {args.start}…")

    set_render_settings()

    for i in range(args.start, args.start + args.count):
        print(f"\n── Sample {i} ──")
        seed = i
        random.seed(seed)
        np.random.seed(seed)

        fabric_path = random.choice(fabric_list)
        hdri_path   = random.choice(hdri_list)

        clear_scene()
        setup_hdri(str(hdri_path))
        setup_camera()

        # Load jacket
        jacket_root, jacket_objs = load_jacket(args.jacket)

        # Find armature
        armature = next(
            (o for o in jacket_objs if o.type == "ARMATURE"), None
        )
        set_random_smpl_pose(armature)

        # Apply fabric to all mesh objects in the jacket
        for obj in jacket_objs:
            if obj.type == "MESH":
                apply_fabric_texture(obj, str(fabric_path))

        # Render 4 images
        base = render_four_images(output_dir, i)
        export_metadata(base, i, fabric_path.stem, hdri_path.stem, seed)
        print(f"  ✓ Sample {i} saved to {base}")

    print(f"\n✅ Done. {args.count} samples in {output_dir}")


if __name__ == "__main__":
    main()