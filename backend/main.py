"""
Lucy Virtual Try-On Backend
FastAPI server — includes /ws/pose for SMPL pose estimation
"""

import os
import sys
import asyncio
import base64
import io
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, List
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import torch
import numpy as np
from PIL import Image

from models.vton_model import VirtualTryOnModel
from models.hmr_model import HMRPoseModel          # ← NEW
from fabric.processor import FabricProcessor
from utils.image_utils import ImageUtils
from utils.pose_utils import PoseUtils

app = FastAPI(
    title="Lucy Virtual Try-On API",
    description="Backend API for real-time virtual try-on with AI enhancement + SMPL pose",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global singletons ────────────────────────────────────────────────────────
vton_model:      Optional[VirtualTryOnModel] = None
hmr_pose_model:  Optional[HMRPoseModel]      = None   # ← NEW
fabric_processor: Optional[FabricProcessor]  = None
active_websockets: List[WebSocket]           = []
model_loading:   bool                        = False
model_load_error: Optional[str]              = None

FABRIC_DIR  = Path("data/fabrics")
CATALOG_DIR = Path("data/catalog")
RESULTS_DIR = Path("data/results")
for _d in [FABRIC_DIR, CATALOG_DIR, RESULTS_DIR]:
    _d.mkdir(parents=True, exist_ok=True)


# ── Pydantic models ──────────────────────────────────────────────────────────

class VirtualTryOnRequest(BaseModel):
    user_image:    str
    jacket_render: str
    pose:          Optional[Dict] = None
    fabric_id:     str

class FabricScanRequest(BaseModel):
    image: str

class FabricResponse(BaseModel):
    id:          str
    name:        str
    diffuseUrl:  str
    normalUrl:   str
    roughnessUrl: str
    thumbnail:   str
    roughness:   float
    metalness:   float


# ── Startup / Shutdown ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    global vton_model, hmr_pose_model, fabric_processor, model_loading, model_load_error

    print("=" * 60)
    print("Starting Lucy Virtual Try-On Backend v2.0")
    print("=" * 60)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    load_ai_model = os.environ.get("LOAD_AI_MODEL", "true").lower() == "true"

    # ── Virtual Try-On model (existing, optional heavy load) ────────────────
    if load_ai_model:
        model_loading    = True
        model_load_error = None

        async def _init_vton():
            global vton_model, model_loading, model_load_error
            try:
                vton_model = VirtualTryOnModel(device=device)
                await vton_model.load_model()
                print("✓ VTON model loaded")
            except Exception as e:
                model_load_error = str(e)
                print(f"✗ VTON model failed: {e} — running in fallback mode")
            finally:
                model_loading = False

        asyncio.create_task(_init_vton())
    else:
        print("Skipping VTON model (LOAD_AI_MODEL=false)")
        model_loading = False
        model_load_error = "Skipped"

    # ── HMR Pose model (lighter, loads fast with MediaPipe fallback) ─────────
    print("\nLoading HMR pose model…")
    try:
        hmr_pose_model = HMRPoseModel(device=device)
        await hmr_pose_model.load_model()
        print("✓ HMR pose model ready")
    except Exception as e:
        print(f"✗ HMR pose model failed: {e}")
        hmr_pose_model = None

    # ── Fabric processor ────────────────────────────────────────────────────
    print("\nInitializing fabric processor…")
    try:
        fabric_processor = FabricProcessor()
        print("✓ Fabric processor ready")
    except Exception as e:
        print(f"✗ Fabric processor failed: {e}")

    print("\n" + "=" * 60)
    print("Backend ready!")
    print("=" * 60 + "\n")


@app.on_event("shutdown")
async def shutdown_event():
    for ws in active_websockets:
        try:
            await ws.close()
        except Exception:
            pass
    print("Backend stopped.")


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status":               "healthy",
        "timestamp":            datetime.now().isoformat(),
        "ai_model_loaded":      vton_model is not None,
        "ai_model_loading":     model_loading,
        "ai_model_error":       model_load_error,
        "hmr_pose_loaded":      hmr_pose_model is not None and hmr_pose_model.is_loaded,
        "fabric_processor_ready": fabric_processor is not None,
        "device":               "cuda" if torch.cuda.is_available() else "cpu",
        "active_connections":   len(active_websockets),
    }


# ── Fabric catalog ───────────────────────────────────────────────────────────

@app.get("/api/fabric/catalog")
async def get_fabric_catalog():
    try:
        catalog_file = CATALOG_DIR / "catalog.json"
        if catalog_file.exists():
            with open(catalog_file) as f:
                fabrics = json.load(f)
        else:
            fabrics = _default_fabrics()
            with open(catalog_file, "w") as f:
                json.dump(fabrics, f, indent=2)
        return {"success": True, "fabrics": fabrics, "count": len(fabrics)}
    except Exception as e:
        return {"success": True, "fabrics": _default_fabrics(), "count": 3}


def _default_fabrics():
    return [
        {"id": "denim-blue",    "name": "Blue Denim",
         "diffuseUrl":  "/static/textures/denim_blue_diffuse.jpg",
         "normalUrl":   "/static/textures/denim_blue_normal.jpg",
         "roughnessUrl":"/static/textures/denim_blue_roughness.jpg",
         "thumbnail":   "/static/textures/denim_blue_thumb.jpg",
         "roughness": 0.8, "metalness": 0.0},
        {"id": "leather-black", "name": "Black Leather",
         "diffuseUrl":  "/static/textures/leather_black_diffuse.jpg",
         "normalUrl":   "/static/textures/leather_black_normal.jpg",
         "roughnessUrl":"/static/textures/leather_black_roughness.jpg",
         "thumbnail":   "/static/textures/leather_black_thumb.jpg",
         "roughness": 0.4, "metalness": 0.1},
        {"id": "cotton-grey",   "name": "Grey Cotton",
         "diffuseUrl":  "/static/textures/cotton_grey_diffuse.jpg",
         "normalUrl":   "/static/textures/cotton_grey_normal.jpg",
         "roughnessUrl":"/static/textures/cotton_grey_roughness.jpg",
         "thumbnail":   "/static/textures/cotton_grey_thumb.jpg",
         "roughness": 0.9, "metalness": 0.0},
    ]


# ── Fabric scan ──────────────────────────────────────────────────────────────

@app.post("/api/fabric/scan")
async def scan_fabric(request: FabricScanRequest):
    if not fabric_processor:
        raise HTTPException(status_code=503, detail="Fabric processor not available")
    try:
        raw   = request.image.split(",")[1] if "," in request.image else request.image
        image = Image.open(io.BytesIO(base64.b64decode(raw)))
        fid   = f"custom_{uuid.uuid4().hex[:8]}"
        result = await fabric_processor.process_fabric(image, fid)
        return {
            "success":    True,
            "fabric_id":  fid,
            "diffuseUrl": result["diffuse_url"],
            "normalUrl":  result["normal_url"],
            "roughnessUrl": result["roughness_url"],
            "roughness":  result.get("roughness", 0.8),
            "metalness":  result.get("metalness", 0.0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fabric processing failed: {e}")


# ── Virtual try-on (premium capture) ─────────────────────────────────────────

@app.post("/virtual-tryon")
async def virtual_tryon(request: VirtualTryOnRequest):
    if not vton_model:
        raise HTTPException(status_code=503, detail="AI model not available")
    try:
        user_image    = ImageUtils.base64_to_image(request.user_image)
        jacket_render = ImageUtils.base64_to_image(request.jacket_render)
        pose_data     = PoseUtils.parse_pose_data(request.pose) if request.pose else None
        result_image  = await vton_model.inference(
            person_image=user_image,
            garment_image=jacket_render,
            pose_data=pose_data,
            num_steps=25,
            fabric_id=request.fabric_id,
        )
        result_id   = f"result_{uuid.uuid4().hex[:8]}"
        result_path = RESULTS_DIR / f"{result_id}.png"
        result_image.save(result_path)
        return {
            "success":      True,
            "result_image": ImageUtils.image_to_base64(result_image, format="PNG"),
            "result_id":    result_id,
            "timestamp":    datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Virtual try-on failed: {e}")


# ── WebSocket: legacy AI keyframes ───────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    client_id = str(uuid.uuid4())[:8]
    print(f"[KeyframeWS] Client {client_id} connected")
    try:
        while True:
            data    = await websocket.receive_text()
            message = json.loads(data)
            if message.get("type") == "keyframe":
                await _process_keyframe(websocket, message, client_id)
    except WebSocketDisconnect:
        print(f"[KeyframeWS] Client {client_id} disconnected")
    except Exception as e:
        print(f"[KeyframeWS] Error {client_id}: {e}")
    finally:
        if websocket in active_websockets:
            active_websockets.remove(websocket)


async def _process_keyframe(websocket: WebSocket, message: Dict, client_id: str):
    try:
        if not vton_model:
            await websocket.send_json({
                "type": "keyframe_result",
                "image": message.get("jacket_render"),
                "timestamp": message.get("timestamp"),
                "mode": "fallback",
            })
            return
        camera_frame  = ImageUtils.base64_to_image(message.get("camera_frame"))
        jacket_render = ImageUtils.base64_to_image(message.get("jacket_render"))
        pose_data     = PoseUtils.parse_pose_data(message.get("pose")) if message.get("pose") else None
        result_image  = await vton_model.inference(
            person_image=camera_frame,
            garment_image=jacket_render,
            pose_data=pose_data,
            num_steps=4,
            fabric_id=message.get("fabric_id"),
        )
        await websocket.send_json({
            "type":      "keyframe_result",
            "image":     ImageUtils.image_to_base64(result_image, format="JPEG", quality=80),
            "timestamp": message.get("timestamp"),
            "mode":      "ai_enhanced",
        })
    except Exception as e:
        await websocket.send_json({
            "type": "error", "error": str(e),
            "timestamp": message.get("timestamp"),
        })


# ═════════════════════════════════════════════════════════════════════════════
# NEW: WebSocket /ws/pose  — real-time SMPL pose estimation
# =============================================================================

@app.websocket("/ws/pose")
async def pose_websocket_endpoint(websocket: WebSocket):
    """
    Real-time SMPL pose estimation WebSocket.

    Client → Server:
      { "type": "pose_frame", "image": "<data-uri JPEG>", "timestamp": <ms> }

    Server → Client:
      {
        "type":     "pose_result",
        "timestamp": <echo>,
        "pose":     [96 floats  — 24 × [qx, qy, qz, qw]],
        "shape":    [10 floats  — SMPL betas],
        "camera":   [3 floats   — weak-perspective [scale, tx, ty]],
        "joints2d": [[x,y],…]  | null,
        "mode":     "hmr2" | "mediapipe" | "neutral"
      }
    """
    await websocket.accept()
    active_websockets.append(websocket)
    client_id = str(uuid.uuid4())[:8]
    print(f"[PoseWS] Client {client_id} connected")

    # Send hello so client knows the backend is alive
    await websocket.send_json({"type": "connected", "client_id": client_id})

    try:
        while True:
            raw_data = await websocket.receive_text()
            message  = json.loads(raw_data)

            if message.get("type") != "pose_frame":
                continue

            timestamp = message.get("timestamp", 0)

            # ── Decode incoming image ────────────────────────────────────
            try:
                b64 = message.get("image", "")
                if "," in b64:
                    b64 = b64.split(",")[1]
                img_bytes = base64.b64decode(b64)
                image     = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            except Exception as decode_err:
                await websocket.send_json({
                    "type": "error",
                    "error": f"image decode failed: {decode_err}",
                    "timestamp": timestamp,
                })
                continue

            # ── Run pose estimation ──────────────────────────────────────
            if hmr_pose_model and hmr_pose_model.is_loaded:
                try:
                    result = await hmr_pose_model.estimate_pose(image)
                except Exception as inf_err:
                    print(f"[PoseWS] Inference error: {inf_err}")
                    result = HMRPoseModel._neutral_result("inference_error")
            else:
                result = HMRPoseModel._neutral_result("model_not_loaded")

            # ── Reply ────────────────────────────────────────────────────
            await websocket.send_json({
                "type":      "pose_result",
                "timestamp": timestamp,
                "pose":      result["pose"],
                "shape":     result["shape"],
                "camera":    result["camera"],
                "joints2d":  result.get("joints2d"),
                "mode":      result.get("mode", "unknown"),
            })

    except WebSocketDisconnect:
        print(f"[PoseWS] Client {client_id} disconnected")
    except Exception as e:
        print(f"[PoseWS] Error {client_id}: {e}")
    finally:
        if websocket in active_websockets:
            active_websockets.remove(websocket)


# ── Root ─────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "name":    "Lucy Virtual Try-On API v2.0",
        "status":  "online",
        "endpoints": {
            "health":        "/health",
            "fabric_catalog":"/api/fabric/catalog",
            "fabric_scan":   "/api/fabric/scan",
            "virtual_tryon": "/virtual-tryon",
            "websocket_ai":  "/ws",
            "websocket_pose":"/ws/pose",   # ← NEW
        },
    }


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5000,
        reload=True,
        log_level="info",
    )