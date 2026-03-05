"""
HMR Pose Model — mediapipe 0.10.30+ (Tasks API only)
Outputs 24 SMPL joint quaternions per frame for jacket skeleton driving.
"""

from __future__ import annotations
import asyncio, math, os, tempfile, urllib.request
from typing import Dict
import numpy as np
from PIL import Image

# ── Math helpers ──────────────────────────────────────────────────────────────

def _rotmat_to_quat(R):
    trace = R[0,0]+R[1,1]+R[2,2]
    if trace > 0:
        s = 0.5/math.sqrt(trace+1.0)
        return np.array([(R[2,1]-R[1,2])*s,(R[0,2]-R[2,0])*s,(R[1,0]-R[0,1])*s,0.25/s],dtype=np.float32)
    elif R[0,0]>R[1,1] and R[0,0]>R[2,2]:
        s = 2.0*math.sqrt(1.0+R[0,0]-R[1,1]-R[2,2])
        return np.array([0.25*s,(R[0,1]+R[1,0])/s,(R[0,2]+R[2,0])/s,(R[2,1]-R[1,2])/s],dtype=np.float32)
    elif R[1,1]>R[2,2]:
        s = 2.0*math.sqrt(1.0+R[1,1]-R[0,0]-R[2,2])
        return np.array([(R[0,1]+R[1,0])/s,0.25*s,(R[1,2]+R[2,1])/s,(R[0,2]-R[2,0])/s],dtype=np.float32)
    else:
        s = 2.0*math.sqrt(1.0+R[2,2]-R[0,0]-R[1,1])
        return np.array([(R[0,2]+R[2,0])/s,(R[1,2]+R[2,1])/s,0.25*s,(R[1,0]-R[0,1])/s],dtype=np.float32)

def _euler_to_quat(rx, ry, rz):
    cy,sy = math.cos(rz*0.5),math.sin(rz*0.5)
    cp,sp = math.cos(ry*0.5),math.sin(ry*0.5)
    cr,sr = math.cos(rx*0.5),math.sin(rx*0.5)
    return np.array([sr*cp*cy-cr*sp*sy, cr*sp*cy+sr*cp*sy,
                     cr*cp*sy-sr*sp*cy, cr*cp*cy+sr*sp*sy], dtype=np.float32)

def _neutral_quats():
    q = np.zeros((24,4), dtype=np.float32); q[:,3]=1.0; return q

# MediaPipe landmark indices
_MP = {
    "LEFT_SHOULDER":11,"RIGHT_SHOULDER":12,
    "LEFT_ELBOW":13,"RIGHT_ELBOW":14,
    "LEFT_WRIST":15,"RIGHT_WRIST":16,
    "LEFT_HIP":23,"RIGHT_HIP":24,
}

_MODEL_URL  = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
               "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")
_MODEL_PATH = os.path.join(tempfile.gettempdir(), "pose_landmarker_lite.task")


# ── Main class ────────────────────────────────────────────────────────────────

class HMRPoseModel:
    def __init__(self, device="cuda"):
        self.device         = device
        self.is_loaded      = False
        self.use_fallback   = True
        self._hmr_model     = None
        self._hmr_cfg       = None
        self._mp_landmarker = None

    # ── Public ────────────────────────────────────────────────────────────────

    async def load_model(self):
        if await self._try_load_hmr2():
            self.use_fallback = False
            print("OK HMR 2.0 pose model loaded")
        else:
            print("  HMR 2.0 unavailable - loading MediaPipe Tasks API...")
            await self._load_mediapipe_tasks()
        self.is_loaded = True

    async def estimate_pose(self, image: Image.Image) -> Dict:
        if not self.is_loaded:
            return self._neutral("not_loaded")
        if not self.use_fallback:
            return await self._estimate_hmr2(image)
        return await self._estimate_mediapipe(image)

    # ── HMR 2.0 ───────────────────────────────────────────────────────────────

    async def _try_load_hmr2(self) -> bool:
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._load_hmr2_sync)
        except Exception as e:
            print(f"  HMR 2.0 not available: {e}"); return False

    def _load_hmr2_sync(self) -> bool:
        try:
            from hmr2.models import load_hmr2, DEFAULT_CHECKPOINT
            self._hmr_model, self._hmr_cfg = load_hmr2(DEFAULT_CHECKPOINT)
            self._hmr_model = self._hmr_model.to(self.device).eval()
            return True
        except Exception as e:
            print(f"  HMR 2.0 load: {e}"); return False

    async def _estimate_hmr2(self, image):
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._hmr2_sync, image)
        except Exception as e:
            print(f"HMR2 inference error: {e}")
            return await self._estimate_mediapipe(image)

    def _hmr2_sync(self, image):
        import torch
        img_np = np.array(image.convert("RGB"))
        h, w   = img_np.shape[:2]
        box    = np.array([[0,0,w,h]], dtype=np.float32)
        from hmr2.datasets.vitdet_dataset import ViTDetDataset
        dl    = torch.utils.data.DataLoader(ViTDetDataset(self._hmr_cfg,img_np,box),batch_size=1)
        batch = {k: v.to(self.device) if hasattr(v,"to") else v for k,v in next(iter(dl)).items()}
        with torch.no_grad():
            out = self._hmr_model(batch)
        pose  = out["pred_smpl_params"]["body_pose"].cpu().numpy()[0]
        glob  = out["pred_smpl_params"]["global_orient"].cpu().numpy()[0]
        betas = out["pred_smpl_params"]["betas"].cpu().numpy()[0]
        cam   = out["pred_cam"].cpu().numpy()[0]
        quats = np.stack([_rotmat_to_quat(R) for R in np.concatenate([glob,pose])])
        j2d   = out.get("pred_keypoints_2d")
        return {
            "pose":     quats.flatten().tolist(),
            "shape":    betas.tolist(),
            "camera":   cam.tolist(),
            "joints2d": j2d.cpu().numpy()[0].tolist() if j2d is not None else None,
            "mode":     "hmr2",
        }

    # ── MediaPipe Tasks API (0.10.30+) ────────────────────────────────────────

    async def _load_mediapipe_tasks(self):
        """
        Load PoseLandmarker via Tasks API.
        This is the ONLY API available in mediapipe 0.10.30+.
        Downloads the lite model (~3 MB) on first run.
        """
        try:
            import mediapipe as mp
            from mediapipe.tasks.python.core.base_options import BaseOptions
            from mediapipe.tasks.python.vision import (
                PoseLandmarker, PoseLandmarkerOptions, RunningMode)

            if not os.path.exists(_MODEL_PATH):
                print("  Downloading pose model (~3 MB)...")
                urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)
                print(f"  Saved to {_MODEL_PATH}")

            opts = PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=_MODEL_PATH),
                running_mode=RunningMode.IMAGE,
                num_poses=1,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self._mp_landmarker = PoseLandmarker.create_from_options(opts)
            print("OK MediaPipe fallback ready (Tasks API 0.10.30+)")

        except Exception as e:
            print(f"  MediaPipe Tasks API failed: {e}")
            print("  WARNING: Running neutral T-pose mode (jacket tracks position only)")
            self._mp_landmarker = None

    async def _estimate_mediapipe(self, image):
        if self._mp_landmarker is None:
            return self._neutral("no_mediapipe")
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._mp_sync, image)
        except Exception as e:
            print(f"MediaPipe inference error: {e}")
            return self._neutral("mp_error")

    def _mp_sync(self, image):
        import mediapipe as mp
        img_rgb  = np.array(image.convert("RGB"))
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        result   = self._mp_landmarker.detect(mp_image)

        if not result.pose_landmarks or not result.pose_world_landmarks:
            return self._neutral("no_landmarks")

        lm   = result.pose_world_landmarks[0]   # world coords (metres)
        lm2d = result.pose_landmarks[0]          # normalised image coords

        quats = _neutral_quats()

        def lv(i):
            return np.array([lm[i].x, lm[i].y, lm[i].z], dtype=np.float64)
        def vis(i):
            return getattr(lm[i], 'visibility', 1.0)

        # Spine (SMPL joints 3, 6, 9)
        if vis(_MP["LEFT_SHOULDER"])>0.3 and vis(_MP["RIGHT_SHOULDER"])>0.3:
            LS,RS = lv(_MP["LEFT_SHOULDER"]),lv(_MP["RIGHT_SHOULDER"])
            LH,RH = lv(_MP["LEFT_HIP"]),lv(_MP["RIGHT_HIP"])
            sm,hm = (LS+RS)*0.5,(LH+RH)*0.5
            roll  = math.atan2(RS[1]-LS[1], RS[0]-LS[0])
            tv    = sm-hm; tl=max(np.linalg.norm(tv),1e-6)
            lean  = math.asin(np.clip(-tv[2]/tl,-1,1))
            for jidx,rf,lf in [(3,.35,.40),(6,.25,.35),(9,.15,.25)]:
                quats[jidx] = _euler_to_quat(lean*lf, 0.0, roll*rf)

        # Left upper arm (16)
        if vis(_MP["LEFT_SHOULDER"])>0.3 and vis(_MP["LEFT_ELBOW"])>0.3:
            d = lv(_MP["LEFT_ELBOW"])-lv(_MP["LEFT_SHOULDER"])
            n = np.linalg.norm(d)
            if n>1e-6:
                d/=n
                quats[16] = _euler_to_quat(
                    0.0,
                    math.atan2(d[2], math.sqrt(d[0]**2+d[1]**2))*0.6,
                    math.atan2(-d[1], d[0])*0.8)

        # Left forearm (18)
        if vis(_MP["LEFT_ELBOW"])>0.3 and vis(_MP["LEFT_WRIST"])>0.3:
            d = lv(_MP["LEFT_WRIST"])-lv(_MP["LEFT_ELBOW"])
            n = np.linalg.norm(d)
            if n>1e-6:
                d/=n
                quats[18] = _euler_to_quat(0.0, 0.0, math.atan2(-d[1],d[0])*0.6)

        # Right upper arm (17)
        if vis(_MP["RIGHT_SHOULDER"])>0.3 and vis(_MP["RIGHT_ELBOW"])>0.3:
            d = lv(_MP["RIGHT_ELBOW"])-lv(_MP["RIGHT_SHOULDER"])
            n = np.linalg.norm(d)
            if n>1e-6:
                d/=n
                quats[17] = _euler_to_quat(
                    0.0,
                    -math.atan2(d[2], math.sqrt(d[0]**2+d[1]**2))*0.6,
                    math.atan2(-d[1], -d[0])*0.8)

        # Right forearm (19)
        if vis(_MP["RIGHT_ELBOW"])>0.3 and vis(_MP["RIGHT_WRIST"])>0.3:
            d = lv(_MP["RIGHT_WRIST"])-lv(_MP["RIGHT_ELBOW"])
            n = np.linalg.norm(d)
            if n>1e-6:
                d/=n
                quats[19] = _euler_to_quat(0.0, 0.0, math.atan2(-d[1],-d[0])*0.6)

        # Camera (weak-perspective from shoulder width)
        ls2,rs2 = lm2d[_MP["LEFT_SHOULDER"]], lm2d[_MP["RIGHT_SHOULDER"]]
        sw = abs(rs2.x - ls2.x)
        return {
            "pose":     quats.flatten().tolist(),
            "shape":    [0.0]*10,
            "camera":   [max(sw*2.8, 0.1),
                         ((ls2.x+rs2.x)*0.5 - 0.5)*2.0,
                         -((ls2.y+rs2.y)*0.5 - 0.38)*2.0],
            "joints2d": [[float(p.x), float(p.y)] for p in lm2d],
            "mode":     "mediapipe",
        }

    @staticmethod
    def _neutral(mode="neutral"):
        q = _neutral_quats()
        return {
            "pose":     q.flatten().tolist(),
            "shape":    [0.0]*10,
            "camera":   [1.0, 0.0, 0.0],
            "joints2d": None,
            "mode":     mode,
        }