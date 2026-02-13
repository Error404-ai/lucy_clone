"""
Lucy Virtual Try-On Backend
FastAPI server for AI-powered virtual try-on with WebSocket support
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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import torch
import numpy as np
from PIL import Image

# Import custom modules
from models.vton_model import VirtualTryOnModel
from fabric.processor import FabricProcessor
from utils.image_utils import ImageUtils
from utils.pose_utils import PoseUtils

# Initialize FastAPI app
app = FastAPI(
    title="Lucy Virtual Try-On API",
    description="Backend API for real-time virtual try-on with AI enhancement",
    version="1.0.0"
)

# CORS middleware - Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
vton_model: Optional[VirtualTryOnModel] = None
fabric_processor: Optional[FabricProcessor] = None
active_websockets: List[WebSocket] = []
model_loading: bool = False
model_load_error: Optional[str] = None

# Data directories
FABRIC_DIR = Path("data/fabrics")
CATALOG_DIR = Path("data/catalog")
RESULTS_DIR = Path("data/results")

# Create directories if they don't exist
for directory in [FABRIC_DIR, CATALOG_DIR, RESULTS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)


# ============================================================================
# Pydantic Models for Request/Response
# ============================================================================

class KeyframeRequest(BaseModel):
    """WebSocket keyframe data"""
    type: str
    timestamp: int
    camera_frame: str  # base64 encoded JPEG
    jacket_render: str  # base64 encoded PNG
    pose: Optional[Dict] = None
    fabric_id: Optional[str] = None


class VirtualTryOnRequest(BaseModel):
    """Premium capture request"""
    user_image: str  # base64 encoded
    jacket_render: str  # base64 encoded
    pose: Optional[Dict] = None
    fabric_id: str


class FabricScanRequest(BaseModel):
    """Fabric scanning request"""
    image: str  # base64 encoded


class FabricResponse(BaseModel):
    """Fabric metadata response"""
    id: str
    name: str
    diffuseUrl: str
    normalUrl: str
    roughnessUrl: str
    thumbnail: str
    roughness: float
    metalness: float


# ============================================================================
# Startup and Shutdown Events
# ============================================================================
@app.on_event("startup")
async def startup_event():
    """Initialize models and processors on startup"""
    global vton_model, fabric_processor, model_loading, model_load_error
    
    print("=" * 60)
    print("Starting Lucy Virtual Try-On Backend")
    print("=" * 60)
    
    # Check for GPU
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    
    # Check environment variable
    load_ai_model = os.environ.get("LOAD_AI_MODEL", "true").lower() == "true"

    if load_ai_model:
        # Initialize Virtual Try-On Model (async to avoid blocking startup)
        print("\nLoading AI model in background...")
        model_loading = True
        model_load_error = None

        async def init_model():
            global vton_model, model_loading, model_load_error
            try:
                vton_model = VirtualTryOnModel(device=device)
                await vton_model.load_model()
                print("✓ AI model loaded successfully")
            except Exception as e:
                model_load_error = str(e)
                print(f"✗ Error loading AI model: {e}")
                print("  Running in fallback mode (3D only)")
            finally:
                model_loading = False

        asyncio.create_task(init_model())
    else:
        print("\nSkipping AI model load (LOAD_AI_MODEL=false)")
        vton_model = None
        model_loading = False
        model_load_error = "Skipped by environment variable"
    
    # Initialize Fabric Processor
    print("\nInitializing fabric processor...")
    try:
        fabric_processor = FabricProcessor()
        print("✓ Fabric processor ready")
    except Exception as e:
        print(f"✗ Error initializing fabric processor: {e}")
    
    print("\n" + "=" * 60)
    print("Backend ready! Listening for connections...")
    print("=" * 60 + "\n")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("\nShutting down backend...")
    
    # Close all WebSocket connections
    for ws in active_websockets:
        try:
            await ws.close()
        except:
            pass
    
    print("Backend stopped.")


# ============================================================================
# Health Check Endpoint
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "ai_model_loaded": vton_model is not None,
        "ai_model_loading": model_loading,
        "ai_model_error": model_load_error,
        "fabric_processor_ready": fabric_processor is not None,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "active_connections": len(active_websockets)
    }


# ============================================================================
# Fabric Catalog Endpoint
# ============================================================================

@app.get("/api/fabric/catalog")
async def get_fabric_catalog():
    """Get all available fabrics from catalog"""
    try:
        fabrics = []
        
        # Load fabrics from catalog directory
        catalog_file = CATALOG_DIR / "catalog.json"
        
        if catalog_file.exists():
            with open(catalog_file, 'r') as f:
                fabrics = json.load(f)
        else:
            # Return default fabrics if catalog doesn't exist
            fabrics = get_default_fabrics()
            
            # Save default catalog
            with open(catalog_file, 'w') as f:
                json.dump(fabrics, f, indent=2)
        
        return {
            "success": True,
            "fabrics": fabrics,
            "count": len(fabrics)
        }
        
    except Exception as e:
        print(f"Error loading fabric catalog: {e}")
        return {
            "success": True,
            "fabrics": get_default_fabrics(),
            "count": 3
        }


def get_default_fabrics():
    """Get default fabric catalog"""
    return [
        {
            "id": "denim-blue",
            "name": "Blue Denim",
            "diffuseUrl": "/static/textures/denim_blue_diffuse.jpg",
            "normalUrl": "/static/textures/denim_blue_normal.jpg",
            "roughnessUrl": "/static/textures/denim_blue_roughness.jpg",
            "thumbnail": "/static/textures/denim_blue_thumb.jpg",
            "roughness": 0.8,
            "metalness": 0.0
        },
        {
            "id": "leather-black",
            "name": "Black Leather",
            "diffuseUrl": "/static/textures/leather_black_diffuse.jpg",
            "normalUrl": "/static/textures/leather_black_normal.jpg",
            "roughnessUrl": "/static/textures/leather_black_roughness.jpg",
            "thumbnail": "/static/textures/leather_black_thumb.jpg",
            "roughness": 0.4,
            "metalness": 0.1
        },
        {
            "id": "cotton-grey",
            "name": "Grey Cotton",
            "diffuseUrl": "/static/textures/cotton_grey_diffuse.jpg",
            "normalUrl": "/static/textures/cotton_grey_normal.jpg",
            "roughnessUrl": "/static/textures/cotton_grey_roughness.jpg",
            "thumbnail": "/static/textures/cotton_grey_thumb.jpg",
            "roughness": 0.9,
            "metalness": 0.0
        }
    ]


# ============================================================================
# Fabric Scanning Endpoint
# ============================================================================

@app.post("/api/fabric/scan")
async def scan_fabric(request: FabricScanRequest):
    """Process uploaded fabric photo and generate PBR textures"""
    try:
        if not fabric_processor:
            raise HTTPException(status_code=503, detail="Fabric processor not available")
        
        # Decode base64 image
        image_data = base64.b64decode(request.image.split(',')[1] if ',' in request.image else request.image)
        image = Image.open(io.BytesIO(image_data))
        
        # Process fabric to generate PBR textures
        fabric_id = f"custom_{uuid.uuid4().hex[:8]}"
        result = await fabric_processor.process_fabric(image, fabric_id)
        
        return {
            "success": True,
            "fabric_id": fabric_id,
            "diffuseUrl": result['diffuse_url'],
            "normalUrl": result['normal_url'],
            "roughnessUrl": result['roughness_url'],
            "roughness": result.get('roughness', 0.8),
            "metalness": result.get('metalness', 0.0)
        }
        
    except Exception as e:
        print(f"Error processing fabric: {e}")
        raise HTTPException(status_code=500, detail=f"Fabric processing failed: {str(e)}")


# ============================================================================
# Premium Virtual Try-On Endpoint
# ============================================================================

@app.post("/virtual-tryon")
async def virtual_tryon(request: VirtualTryOnRequest):
    """Generate high-quality AI-enhanced try-on image (premium capture)"""
    try:
        if not vton_model:
            raise HTTPException(status_code=503, detail="AI model not available")
        
        # Decode images
        user_image = ImageUtils.base64_to_image(request.user_image)
        jacket_render = ImageUtils.base64_to_image(request.jacket_render)
        
        # Parse pose data if available
        pose_data = PoseUtils.parse_pose_data(request.pose) if request.pose else None
        
        # Run AI virtual try-on (full quality, ~3-5 seconds)
        result_image = await vton_model.inference(
            person_image=user_image,
            garment_image=jacket_render,
            pose_data=pose_data,
            num_steps=25,  # Full quality
            fabric_id=request.fabric_id
        )
        
        # Save result
        result_id = f"result_{uuid.uuid4().hex[:8]}"
        result_path = RESULTS_DIR / f"{result_id}.png"
        result_image.save(result_path, quality=95)
        
        # Convert to base64
        result_base64 = ImageUtils.image_to_base64(result_image, format='PNG')
        
        return {
            "success": True,
            "result_image": result_base64,
            "result_id": result_id,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"Error in virtual try-on: {e}")
        raise HTTPException(status_code=500, detail=f"Virtual try-on failed: {str(e)}")


# ============================================================================
# WebSocket Endpoint for Real-Time Keyframes
# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket connection for real-time AI keyframe enhancement"""
    await websocket.accept()
    active_websockets.append(websocket)
    
    client_id = str(uuid.uuid4())[:8]
    print(f"[WebSocket] Client {client_id} connected")
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get('type') == 'keyframe':
                # Process keyframe
                await process_keyframe(websocket, message, client_id)
            
    except WebSocketDisconnect:
        print(f"[WebSocket] Client {client_id} disconnected")
    except Exception as e:
        print(f"[WebSocket] Error with client {client_id}: {e}")
    finally:
        if websocket in active_websockets:
            active_websockets.remove(websocket)


async def process_keyframe(websocket: WebSocket, message: Dict, client_id: str):
    """Process a keyframe and return AI-enhanced result"""
    try:
        if not vton_model:
            # Fallback: echo back the 3D render if AI not available
            await websocket.send_json({
                "type": "keyframe_result",
                "image": message.get('jacket_render'),
                "timestamp": message.get('timestamp'),
                "mode": "fallback"
            })
            return
        
        # Decode images
        camera_frame = ImageUtils.base64_to_image(message.get('camera_frame'))
        jacket_render = ImageUtils.base64_to_image(message.get('jacket_render'))
        
        # Parse pose
        pose_data = PoseUtils.parse_pose_data(message.get('pose')) if message.get('pose') else None
        
        # Run fast AI inference (4 steps, ~300-500ms)
        result_image = await vton_model.inference(
            person_image=camera_frame,
            garment_image=jacket_render,
            pose_data=pose_data,
            num_steps=4,  # Fast mode for real-time
            fabric_id=message.get('fabric_id')
        )
        
        # Convert to base64
        result_base64 = ImageUtils.image_to_base64(result_image, format='JPEG', quality=80)
        
        # Send result back to client
        await websocket.send_json({
            "type": "keyframe_result",
            "image": result_base64,
            "timestamp": message.get('timestamp'),
            "mode": "ai_enhanced"
        })
        
        print(f"[WebSocket] Processed keyframe for client {client_id}")
        
    except Exception as e:
        print(f"[WebSocket] Error processing keyframe: {e}")
        # Send error message
        await websocket.send_json({
            "type": "error",
            "error": str(e),
            "timestamp": message.get('timestamp')
        })


# ============================================================================
# Root Endpoint
# ============================================================================

@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "name": "Lucy Virtual Try-On API",
        "version": "1.0.0",
        "status": "online",
        "endpoints": {
            "health": "/health",
            "fabric_catalog": "/api/fabric/catalog",
            "fabric_scan": "/api/fabric/scan",
            "virtual_tryon": "/virtual-tryon",
            "websocket": "/ws"
        }
    }


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    # Run the server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5000,
        reload=True,  # Auto-reload on code changes (disable in production)
        log_level="info"
    )
