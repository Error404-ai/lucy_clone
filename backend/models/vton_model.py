"""
Virtual Try-On Model — CORRECTED
PDF Phase 3, Steps 11-14

BUG FIXED: Original loaded 'runwayml/stable-diffusion-inpainting'
The doc clearly says: yisol/IDM-VTON (Step 3, Step 11)
"""
import os, torch
from PIL import Image, ImageDraw
from typing import Optional, Dict


class VirtualTryOnModel:
    def __init__(self, device="cuda", model_path=None):
        self.device = device
        # ✅ CORRECT: IDM-VTON per PDF Step 3 & 11
        self.model_path = model_path or os.environ.get("VTON_MODEL_PATH", "yisol/IDM-VTON")
        self.pipe = None
        self.is_loaded = False

    async def load_model(self):
        """
        PREREQS (do these first):
          huggingface-cli login
          Accept license at huggingface.co/yisol/IDM-VTON
        Then this will work.
        """
        print(f"Loading IDM-VTON from {self.model_path}…")
        try:
            from diffusers import AutoPipelineForInpainting
            dtype = torch.float16 if self.device == "cuda" else torch.float32
            self.pipe = AutoPipelineForInpainting.from_pretrained(
                self.model_path, torch_dtype=dtype,
                safety_checker=None, requires_safety_checker=False
            ).to(self.device)

            # Step 12 optimisations
            if self.device == "cuda":
                self.pipe.enable_attention_slicing()
                try:
                    self.pipe.enable_xformers_memory_efficient_attention()
                except Exception:
                    pass

            # Step 33: torch.compile
            try:
                self.pipe.unet = torch.compile(self.pipe.unet, mode="reduce-overhead")
            except Exception:
                pass

            # Step 33: pre-warm
            self._prewarm()
            self.is_loaded = True
            print("✓ IDM-VTON ready")
        except Exception as e:
            print(f"✗ Load failed: {e}")
            print("  → huggingface-cli login, accept IDM-VTON license")
            self.is_loaded = False
            raise

    def _prewarm(self):
        dummy = Image.new("RGB", (384, 512), 128)
        mask  = Image.new("L",   (384, 512), 255)
        with torch.inference_mode():
            self.pipe(prompt="test", image=dummy, mask_image=mask,
                      num_inference_steps=1, output_type="pil")
        print("  ✓ Pre-warmed")

    async def inference(self, person_image, garment_image,
                        pose_data=None, num_steps=25, fabric_id=None):
        """
        num_steps=25 → premium capture (Step 29)
        num_steps=4  → WebSocket keyframes (Step 27-28)
        """
        if not self.is_loaded:
            return self._fallback(person_image, garment_image)
        try:
            W, H = 384, 512
            p = person_image.resize((W, H), Image.LANCZOS)
            g = garment_image.resize((W, H), Image.LANCZOS)
            mask = self._mask(g, pose_data, W, H)
            with torch.inference_mode():
                out = self.pipe(
                    prompt="person wearing jacket, photorealistic, high quality",
                    negative_prompt="blurry, distorted, artifacts",
                    image=p, mask_image=mask,
                    num_inference_steps=num_steps, guidance_scale=7.5, strength=0.85
                ).images[0]
            return out.resize(person_image.size, Image.LANCZOS)
        except Exception as e:
            print(f"Inference error: {e}")
            return self._fallback(person_image, garment_image)

    def _mask(self, garment, pose_data, W, H):
        if garment.mode == "RGBA":
            return garment.split()[3].point(lambda x: 255 if x > 50 else 0)
        mask = Image.new("L", (W, H), 0)
        draw = ImageDraw.Draw(mask)
        if pose_data and pose_data.get("landmarks"):
            lm = pose_data["landmarks"]
            try:
                xs = [lm[11]["x"], lm[12]["x"], lm[23]["x"], lm[24]["x"]]
                ys = [lm[11]["y"], lm[12]["y"], lm[23]["y"], lm[24]["y"]]
                draw.rectangle([int(min(xs)*W*.85), int(min(ys)*H*.85),
                                int(max(xs)*W*1.15), int(max(ys)*H*1.1)], fill=255)
                return mask
            except (KeyError, IndexError):
                pass
        draw.rectangle([0, 0, W, int(H*.75)], fill=255)
        return mask

    def _fallback(self, person, garment):
        if person.size != garment.size:
            garment = garment.resize(person.size, Image.LANCZOS)
        return Image.alpha_composite(
            person.convert("RGBA"), garment.convert("RGBA")
        ).convert("RGB")

    def unload_model(self):
        del self.pipe; self.pipe = None
        if torch.cuda.is_available(): torch.cuda.empty_cache()
        self.is_loaded = False