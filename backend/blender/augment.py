"""
Data Augmentation Pipeline
PDF Phase 2, Step 10

Bridges the "sim-to-real gap" so the model works on real camera photos.
Adds: noise, JPEG artifacts, brightness/contrast variation, motion blur.
Composites rendered humans onto real Unsplash backgrounds.

Usage:
  python augment.py \
    --input  path/to/rendered_samples/ \
    --bgs    path/to/unsplash_backgrounds/ \
    --output path/to/augmented/
"""

import cv2
import numpy as np
from PIL import Image
from pathlib import Path
import argparse
import json
import random
from concurrent.futures import ThreadPoolExecutor, as_completed


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--input",  required=True, help="Folder of rendered samples")
    p.add_argument("--bgs",    required=True, help="Folder of background photos")
    p.add_argument("--output", required=True, help="Output folder")
    p.add_argument("--workers", type=int, default=8)
    return p.parse_args()


# ─────────────────────────────────────────────────────────
# Augmentation helpers
# ─────────────────────────────────────────────────────────

def add_camera_noise(img: np.ndarray, intensity=0.02) -> np.ndarray:
    """Gaussian noise to simulate camera sensor noise."""
    noise = np.random.randn(*img.shape) * intensity * 255
    return np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)


def add_jpeg_artifacts(img: np.ndarray, quality_range=(50, 85)) -> np.ndarray:
    """Encode/decode at random JPEG quality to add compression artifacts."""
    q = random.randint(*quality_range)
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def random_brightness_contrast(img: np.ndarray) -> np.ndarray:
    """Random brightness & contrast shift."""
    alpha = random.uniform(0.7, 1.3)   # contrast
    beta  = random.uniform(-30, 30)    # brightness
    return np.clip(alpha * img.astype(np.float32) + beta, 0, 255).astype(np.uint8)


def add_motion_blur(img: np.ndarray, max_kernel=7) -> np.ndarray:
    """Simulate camera shake / motion blur."""
    k = random.choice([3, 5, 7])
    if k > max_kernel or random.random() > 0.3:
        return img                         # only apply 30% of the time
    kernel = np.zeros((k, k))
    if random.random() > 0.5:
        kernel[k // 2, :] = 1 / k         # horizontal
    else:
        kernel[:, k // 2] = 1 / k         # vertical
    return cv2.filter2D(img, -1, kernel)


def composite_background(foreground_rgba: np.ndarray,
                          background: np.ndarray) -> np.ndarray:
    """
    Step 10: Composite rendered human (with alpha) onto real BG photo.
    foreground_rgba: H×W×4  (RGBA)
    background:      H×W×3  (BGR)
    """
    h, w = foreground_rgba.shape[:2]
    bg = cv2.resize(background, (w, h), interpolation=cv2.INTER_LINEAR)

    fg_bgr   = foreground_rgba[:, :, :3]
    alpha    = foreground_rgba[:, :, 3:4].astype(np.float32) / 255.0

    composite = (alpha * fg_bgr + (1 - alpha) * bg).astype(np.uint8)
    return composite


def augment_sample(sample_dir: Path, bg_list: list, output_dir: Path, seed: int):
    """Process one rendered sample → multiple augmented variants."""
    random.seed(seed)
    np.random.seed(seed)

    meta_path = sample_dir / "metadata.json"
    if not meta_path.exists():
        return

    with open(meta_path) as f:
        meta = json.load(f)

    # Load the two training images: person_only and with_jacket
    person_path = sample_dir / "person_only.png"
    jacket_path = sample_dir / "with_jacket.png"
    mask_path   = sample_dir / "mask.png"

    if not (person_path.exists() and jacket_path.exists()):
        return

    person  = cv2.imread(str(person_path), cv2.IMREAD_UNCHANGED)
    jacket  = cv2.imread(str(jacket_path), cv2.IMREAD_UNCHANGED)
    mask    = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE) if mask_path.exists() else None

    # Pick a random background
    bg_img = cv2.imread(str(random.choice(bg_list)))

    # Composite person onto real background
    if person.shape[2] == 4:
        person_comp = composite_background(person, bg_img)
    else:
        person_comp = cv2.resize(bg_img, (person.shape[1], person.shape[0]))

    if jacket.shape[2] == 4:
        jacket_comp = composite_background(jacket, bg_img)
    else:
        jacket_comp = jacket

    # Apply augmentations
    person_aug = add_motion_blur(
                    add_jpeg_artifacts(
                        random_brightness_contrast(
                            add_camera_noise(person_comp))))

    jacket_aug = add_motion_blur(
                    add_jpeg_artifacts(
                        random_brightness_contrast(
                            add_camera_noise(jacket_comp))))

    # Save augmented pair
    sample_id  = meta["sample_id"]
    out_dir    = output_dir / f"aug_{sample_id:06d}"
    out_dir.mkdir(parents=True, exist_ok=True)

    cv2.imwrite(str(out_dir / "person.jpg"),  person_aug, [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(str(out_dir / "target.jpg"),  jacket_aug, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if mask is not None:
        cv2.imwrite(str(out_dir / "mask.png"), mask)

    # Copy jacket-only (clean render, used as garment reference)
    jacket_only = sample_dir / "jacket_only.png"
    if jacket_only.exists():
        import shutil
        shutil.copy(str(jacket_only), str(out_dir / "garment.png"))

    # Save metadata
    aug_meta = {**meta, "augmented": True,
                "background": str(random.choice(bg_list).name)}
    with open(out_dir / "metadata.json", "w") as f:
        json.dump(aug_meta, f, indent=2)


def main():
    args   = parse_args()
    inp    = Path(args.input)
    bgs    = Path(args.bgs)
    out    = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    sample_dirs = sorted([d for d in inp.iterdir() if d.is_dir()])
    bg_list     = (sorted(bgs.glob("*.jpg")) + sorted(bgs.glob("*.jpeg")) +
                   sorted(bgs.glob("*.png")))

    if not bg_list:
        raise RuntimeError(f"No background images found in {bgs}")

    print(f"Samples:     {len(sample_dirs)}")
    print(f"Backgrounds: {len(bg_list)}")
    print(f"Workers:     {args.workers}")

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {
            ex.submit(augment_sample, d, bg_list, out, i): d
            for i, d in enumerate(sample_dirs)
        }
        done = 0
        for fut in as_completed(futures):
            done += 1
            if done % 500 == 0:
                print(f"  {done}/{len(sample_dirs)} augmented…")
            try:
                fut.result()
            except Exception as e:
                print(f"  ✗ {futures[fut].name}: {e}")

    print(f"\n✅ Augmentation done → {out}")


if __name__ == "__main__":
    main()