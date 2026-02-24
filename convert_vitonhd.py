"""
convert_vitonhd.py

Converts the official VITON-HD dataset structure into the
sample_XXXXXX/ format expected by train_vton.py

Usage:
    python convert_vitonhd.py \
        --viton_dir path/to/viton_hd/train \
        --output    path/to/output/

What it does:
    person.jpg  <- viton_hd/train/image/<id>.jpg          (person WITHOUT garment)
    garment.png <- viton_hd/train/cloth/<id>.jpg          (flat garment image)
    mask.png    <- viton_hd/train/cloth-mask/<id>.jpg     (binary mask)
    target.jpg  <- same as person.jpg (person IS already wearing the garment in real photos)
                   OR use paired image if you have it

NOTE: In VITON-HD, the person image IS the ground truth (they're already wearing it).
So target.jpg = person.jpg for the real dataset. During training, the model learns
to reconstruct the person image (target) given the garment + a "naked" version.
"""

import os
import shutil
import argparse
from pathlib import Path
from PIL import Image
import json


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--viton_dir", required=True,
                   help="Path to viton_hd/train (or test)")
    p.add_argument("--output", required=True,
                   help="Output directory for converted samples")
    p.add_argument("--limit", type=int, default=None,
                   help="Optional: only convert first N samples (for testing)")
    return p.parse_args()


def convert(viton_dir: Path, output_dir: Path, limit=None):
    image_dir     = viton_dir / "image"
    cloth_dir     = viton_dir / "cloth"
    mask_dir      = viton_dir / "cloth-mask"
    parse_dir     = viton_dir / "image-parse-v3"   # optional
    pose_dir      = viton_dir / "openpose-json"     # optional

    # Get list of paired samples from the image directory
    image_files = sorted(image_dir.glob("*.jpg")) + sorted(image_dir.glob("*.png"))

    if not image_files:
        raise FileNotFoundError(f"No images found in {image_dir}")

    if limit:
        image_files = image_files[:limit]

    print(f"Found {len(image_files)} samples. Converting...")

    converted = 0
    skipped   = 0

    for idx, img_path in enumerate(image_files):
        stem = img_path.stem  # e.g. "000001_0"

        # VITON-HD naming: person images end in _0, cloth images end in _1
        # e.g. 000001_0.jpg (person) pairs with 000001_1.jpg (cloth)
        # Check naming convention
        cloth_stem = stem.replace("_0", "_1") if "_0" in stem else stem

        cloth_path = (cloth_dir / f"{cloth_stem}.jpg")
        if not cloth_path.exists():
            cloth_path = cloth_dir / f"{cloth_stem}.png"
        if not cloth_path.exists():
            cloth_path = cloth_dir / f"{stem}.jpg"
        if not cloth_path.exists():
            cloth_path = cloth_dir / f"{stem}.png"

        mask_path = (mask_dir / f"{cloth_stem}.jpg")
        if not mask_path.exists():
            mask_path = mask_dir / f"{cloth_stem}.png"
        if not mask_path.exists():
            mask_path = mask_dir / f"{stem}.jpg"
        if not mask_path.exists():
            mask_path = mask_dir / f"{stem}.png"

        if not cloth_path.exists():
            print(f"  SKIP {stem}: no cloth image found")
            skipped += 1
            continue

        if not mask_path.exists():
            print(f"  SKIP {stem}: no mask found")
            skipped += 1
            continue

        # Create output sample folder
        sample_dir = output_dir / f"sample_{idx:06d}"
        sample_dir.mkdir(parents=True, exist_ok=True)

        # Copy/convert files
        shutil.copy(img_path, sample_dir / "person.jpg")
        shutil.copy(img_path, sample_dir / "target.jpg")   # same image = ground truth

        # Convert garment to PNG (preserves any transparency)
        garment_img = Image.open(cloth_path).convert("RGBA")
        garment_img.save(sample_dir / "garment.png")

        # Convert mask to grayscale PNG
        mask_img = Image.open(mask_path).convert("L")
        mask_img.save(sample_dir / "mask.png")

        # Save metadata
        meta = {
            "sample_id":     idx,
            "original_id":   stem,
            "cloth_id":      cloth_stem,
            "source":        "viton_hd",
            "images": {
                "person":    "person.jpg",
                "garment":   "garment.png",
                "target":    "target.jpg",
                "mask":      "mask.png",
            }
        }

        # Optionally include pose path
        if pose_dir:
            pose_file = pose_dir / f"{stem}_keypoints.json"
            if pose_file.exists():
                with open(pose_file) as pf:
                    meta["pose"] = json.load(pf)

        with open(sample_dir / "metadata.json", "w") as f:
            json.dump(meta, f, indent=2)

        converted += 1
        if converted % 500 == 0:
            print(f"  Converted {converted}/{len(image_files)}...")

    print(f"\nDone.")
    print(f"  Converted : {converted}")
    print(f"  Skipped   : {skipped}")
    print(f"  Output    : {output_dir}")


def main():
    args = parse_args()
    viton_dir  = Path(args.viton_dir)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not viton_dir.exists():
        raise FileNotFoundError(f"VITON dir not found: {viton_dir}")

    convert(viton_dir, output_dir, limit=args.limit)


if __name__ == "__main__":
    main()