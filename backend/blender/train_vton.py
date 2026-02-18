"""
IDM-VTON Fine-Tuning Script
PDF Phase 3, Step 12

Per the doc:
  - Freeze VAE and text encoder, fine-tune UNet only
  - batch size 4-8, lr 1e-5, cosine scheduler, 50K-100K steps
  - mixed precision fp16
  - gradient checkpointing
  - validate every 1000 steps (Step 13)
  - Training time: 24-72 hours on g5.12xlarge or p4d.24xlarge

Usage:
  accelerate launch train_vton.py \
    --dataset_path /path/to/augmented/ \
    --output_dir   ./checkpoints/ \
    --max_steps    100000
"""

import os
import argparse
import math
import json
import torch
import torch.nn.functional as F
from pathlib import Path
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from accelerate import Accelerator
from accelerate.logging import get_logger
from accelerate.utils import ProjectConfiguration
from diffusers import (
    AutoencoderKL,
    UNet2DConditionModel,
    DDPMScheduler,
    get_cosine_schedule_with_warmup,
)
from transformers import CLIPTextModel, CLIPTokenizer

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────
# Dataset
# ─────────────────────────────────────────────────────────
class VTONDataset(Dataset):
    """
    Each sample dir contains:
      person.jpg   – person photo (input)
      garment.png  – jacket-only render (conditioning)
      target.jpg   – person WITH jacket (ground truth)
      mask.png     – binary mask of jacket region
    """

    def __init__(self, root: str, size=(512, 384)):
        self.root    = Path(root)
        self.samples = sorted([d for d in self.root.iterdir() if d.is_dir()])
        self.size    = size   # (H, W)

        self.img_tf = transforms.Compose([
            transforms.Resize(size),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5]),
        ])
        self.mask_tf = transforms.Compose([
            transforms.Resize(size, interpolation=transforms.InterpolationMode.NEAREST),
            transforms.ToTensor(),
        ])

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        d = self.samples[idx]
        try:
            person  = Image.open(d / "person.jpg").convert("RGB")
            garment = Image.open(d / "garment.png").convert("RGB")
            target  = Image.open(d / "target.jpg").convert("RGB")
            mask    = Image.open(d / "mask.png").convert("L") \
                      if (d / "mask.png").exists() \
                      else Image.new("L", person.size, 255)

            return {
                "person":  self.img_tf(person),
                "garment": self.img_tf(garment),
                "target":  self.img_tf(target),
                "mask":    self.mask_tf(mask),
            }
        except Exception as e:
            # Return zeros on bad sample rather than crashing
            H, W = self.size
            return {
                "person":  torch.zeros(3, H, W),
                "garment": torch.zeros(3, H, W),
                "target":  torch.zeros(3, H, W),
                "mask":    torch.zeros(1, H, W),
            }


# ─────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--base_model",   default="yisol/IDM-VTON")
    p.add_argument("--dataset_path", required=True)
    p.add_argument("--output_dir",   default="./checkpoints")
    p.add_argument("--max_steps",    type=int,   default=100000)
    p.add_argument("--batch_size",   type=int,   default=4)
    p.add_argument("--lr",           type=float, default=1e-5)
    p.add_argument("--warmup_steps", type=int,   default=500)
    p.add_argument("--save_every",   type=int,   default=1000)
    p.add_argument("--val_every",    type=int,   default=1000)
    p.add_argument("--grad_ckpt",    action="store_true",
                   help="Enable gradient checkpointing (Step 12: saves VRAM)")
    p.add_argument("--mixed_precision", default="fp16",
                   choices=["no", "fp16", "bf16"])
    return p.parse_args()


def main():
    args = parse_args()

    proj_cfg    = ProjectConfiguration(project_dir=args.output_dir, logging_dir="logs")
    accelerator = Accelerator(
        mixed_precision=args.mixed_precision,
        gradient_accumulation_steps=2,
        log_with="tensorboard",
        project_config=proj_cfg,
    )

    # ── Load model components ──────────────────────────
    print(f"Loading base model: {args.base_model}")
    tokenizer  = CLIPTokenizer.from_pretrained(args.base_model, subfolder="tokenizer")
    text_enc   = CLIPTextModel.from_pretrained(args.base_model, subfolder="text_encoder")
    vae        = AutoencoderKL.from_pretrained(args.base_model, subfolder="vae")
    unet       = UNet2DConditionModel.from_pretrained(args.base_model, subfolder="unet")
    noise_sched = DDPMScheduler.from_pretrained(args.base_model, subfolder="scheduler")

    # ── Step 12: Freeze VAE + text encoder, train UNet only ──
    vae.requires_grad_(False)
    text_enc.requires_grad_(False)
    unet.requires_grad_(True)

    if args.grad_ckpt:
        unet.enable_gradient_checkpointing()
        print("  ✓ Gradient checkpointing enabled")

    # ── Dataset & DataLoader ──────────────────────────
    dataset = VTONDataset(args.dataset_path)
    loader  = DataLoader(
        dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=4,
        pin_memory=True,
        drop_last=True,
    )
    print(f"Dataset: {len(dataset)} samples, batch={args.batch_size}")

    # ── Optimiser & scheduler ─────────────────────────
    optimizer = torch.optim.AdamW(
        unet.parameters(), lr=args.lr, weight_decay=1e-2
    )
    steps_per_epoch = len(loader)
    lr_scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=args.warmup_steps,
        num_training_steps=args.max_steps,
    )

    # ── Accelerate prep ───────────────────────────────
    unet, optimizer, loader, lr_scheduler = accelerator.prepare(
        unet, optimizer, loader, lr_scheduler
    )
    vae.to(accelerator.device)
    text_enc.to(accelerator.device)

    # Null text embedding (unconditional)
    null_tokens = tokenizer(
        [""], padding="max_length", max_length=77,
        truncation=True, return_tensors="pt"
    ).input_ids.to(accelerator.device)
    null_emb = text_enc(null_tokens)[0]

    # ── Training loop ─────────────────────────────────
    global_step = 0
    print(f"Starting training for {args.max_steps} steps…")

    while global_step < args.max_steps:
        unet.train()
        for batch in loader:
            if global_step >= args.max_steps:
                break

            with accelerator.accumulate(unet):
                # Encode target to latent space
                with torch.no_grad():
                    target_lat = vae.encode(
                        batch["target"].to(accelerator.device)
                    ).latent_dist.sample() * vae.config.scaling_factor

                    garment_lat = vae.encode(
                        batch["garment"].to(accelerator.device)
                    ).latent_dist.sample() * vae.config.scaling_factor

                # Add noise
                noise       = torch.randn_like(target_lat)
                timesteps   = torch.randint(
                    0, noise_sched.config.num_train_timesteps,
                    (target_lat.shape[0],), device=accelerator.device
                ).long()
                noisy_lat   = noise_sched.add_noise(target_lat, noise, timesteps)

                # Concatenate garment latent as extra conditioning channels
                model_input = torch.cat([noisy_lat, garment_lat], dim=1)

                # Forward pass (use null text embedding)
                bs = target_lat.shape[0]
                emb = null_emb.expand(bs, -1, -1)

                noise_pred  = unet(model_input, timesteps, emb).sample

                # MSE loss
                loss = F.mse_loss(noise_pred.float(), noise.float())

                accelerator.backward(loss)
                if accelerator.sync_gradients:
                    accelerator.clip_grad_norm_(unet.parameters(), 1.0)

                optimizer.step()
                lr_scheduler.step()
                optimizer.zero_grad()

            global_step += 1

            # ── Step 13: Validate every 1000 steps ──
            if global_step % args.val_every == 0:
                logger.info(f"Step {global_step}: loss={loss.item():.4f}  "
                            f"lr={lr_scheduler.get_last_lr()[0]:.2e}")
                # TODO: run inference on a few val images and save to output_dir/val/

            # ── Save checkpoint ──────────────────────
            if global_step % args.save_every == 0:
                if accelerator.is_main_process:
                    ckpt = Path(args.output_dir) / f"step_{global_step:06d}"
                    accelerator.unwrap_model(unet).save_pretrained(str(ckpt))
                    print(f"  ✓ Saved checkpoint: {ckpt}")

    # ── Final save ────────────────────────────────────
    if accelerator.is_main_process:
        final = Path(args.output_dir) / "final"
        accelerator.unwrap_model(unet).save_pretrained(str(final))
        print(f"\n✅ Training complete. Final model: {final}")

    accelerator.end_training()


if __name__ == "__main__":
    main()