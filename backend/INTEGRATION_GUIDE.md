# Frontend-Backend Integration Guide

This guide explains exactly how the Lucy Virtual Try-On frontend and backend connect and communicate.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        USER DEVICE                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              FRONTEND (Browser)                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │  │
│  │  │  Camera    │  │ MediaPipe  │  │   Three.js    │  │  │
│  │  │  Capture   │→ │   Pose     │→ │  3D Render    │  │  │
│  │  └────────────┘  └────────────┘  └───────────────┘  │  │
│  │         │                                 │           │  │
│  │         └─────────────┬───────────────────┘           │  │
│  │                       ↓                               │  │
│  │         ┌──────────────────────────┐                  │  │
│  │         │   AI Pipeline Manager    │                  │  │
│  │         └──────────────────────────┘                  │  │
│  │              │              │                         │  │
│  │              │ WebSocket    │ REST                    │  │
│  │              │ (keyframes)  │ (capture, fabrics)      │  │
│  └──────────────┼──────────────┼─────────────────────────┘  │
└─────────────────┼──────────────┼────────────────────────────┘
                  │              │
                  ↓              ↓
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND SERVER                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  FastAPI Application                  │  │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │  │
│  │  │ WebSocket  │  │  REST API  │  │    Fabric     │  │  │
│  │  │   /ws      │  │ Endpoints  │  │  Processor    │  │  │
│  │  └────────────┘  └────────────┘  └───────────────┘  │  │
│  │         │              │                 │           │  │
│  │         └──────────────┴─────────────────┘           │  │
│  │                       ↓                               │  │
│  │         ┌──────────────────────────┐                  │  │
│  │         │  Virtual Try-On AI Model │                  │  │
│  │         │  (Stable Diffusion)      │                  │  │
│  │         └──────────────────────────┘                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Communication Protocols

### 1. WebSocket Connection (Real-Time Keyframes)

**Purpose**: Stream camera frames for real-time AI enhancement

**Endpoint**: `ws://localhost:5000/ws`

**Frontend Code** (`frontend/js/ai-pipeline.js`):
```javascript
// Connect
this.ws = new WebSocket(CONFIG.API.WS_URL);

// Send keyframe every 1.5 seconds
const payload = {
    type: 'keyframe',
    timestamp: Date.now(),
    camera_frame: cameraFrameBase64,  // JPEG, base64
    jacket_render: jacketRenderBase64, // PNG, base64
    pose: {
        landmarks: [...],
        shoulderWidth: 0.25,
        rotation: 2.5
    },
    fabric_id: 'denim-blue'
};
this.ws.send(JSON.stringify(payload));

// Receive result
this.ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'keyframe_result') {
        // Use message.image (base64) for blending
    }
};
```

**Backend Code** (`main.py`):
```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    while True:
        data = await websocket.receive_text()
        message = json.loads(data)
        
        if message.get('type') == 'keyframe':
            # Process with AI (4 steps, fast)
            result = await vton_model.inference(...)
            
            # Send back
            await websocket.send_json({
                "type": "keyframe_result",
                "image": result_base64,
                "timestamp": message['timestamp']
            })
```

**Data Flow**:
1. Frontend: Capture camera frame → base64 JPEG
2. Frontend: Render 3D jacket → base64 PNG
3. Frontend: Get pose landmarks from MediaPipe
4. Frontend: Send all via WebSocket
5. Backend: Decode images
6. Backend: Run AI inference (4 steps, ~300-500ms)
7. Backend: Encode result → base64
8. Backend: Send back via WebSocket
9. Frontend: Blend AI result with live 3D render

### 2. REST API - Premium Capture

**Purpose**: Generate high-quality try-on photo

**Endpoint**: `POST http://localhost:5000/virtual-tryon`

**Frontend Code** (`frontend/js/capture.js`):
```javascript
const payload = {
    user_image: cameraFrameBase64,  // JPEG, base64
    jacket_render: jacketRenderBase64, // PNG, base64
    pose: {
        landmarks: [...],
        shoulderWidth: 0.25,
        rotation: 2.5
    },
    fabric_id: 'denim-blue'
};

const response = await fetch(
    `${CONFIG.API.BASE_URL}/virtual-tryon`,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }
);

const data = await response.json();
// data.result_image is base64 PNG
```

**Backend Code** (`main.py`):
```python
@app.post("/virtual-tryon")
async def virtual_tryon(request: VirtualTryOnRequest):
    # Decode images
    user_image = ImageUtils.base64_to_image(request.user_image)
    jacket_render = ImageUtils.base64_to_image(request.jacket_render)
    
    # Run AI (25 steps, high quality)
    result = await vton_model.inference(
        person_image=user_image,
        garment_image=jacket_render,
        pose_data=request.pose,
        num_steps=25
    )
    
    # Return
    return {
        "success": True,
        "result_image": ImageUtils.image_to_base64(result, 'PNG'),
        "result_id": result_id
    }
```

**Timeline**:
- Frontend: User taps capture button
- Frontend: Show loading spinner
- Frontend: Send request
- Backend: Process (3-5 seconds)
- Frontend: Receive result
- Frontend: Display in modal
- Frontend: Offer download/share

### 3. REST API - Fabric Catalog

**Purpose**: Load available fabrics on startup

**Endpoint**: `GET http://localhost:5000/api/fabric/catalog`

**Frontend Code** (`frontend/js/fabric-selector.js`):
```javascript
const response = await fetch(
    `${CONFIG.API.BASE_URL}/api/fabric/catalog`
);
const data = await response.json();

// data.fabrics is array of fabric objects
this.fabrics = data.fabrics;
this.renderFabrics();
```

**Backend Code** (`main.py`):
```python
@app.get("/api/fabric/catalog")
async def get_fabric_catalog():
    # Load from catalog.json
    with open('data/catalog/catalog.json') as f:
        fabrics = json.load(f)
    
    return {
        "success": True,
        "fabrics": fabrics,
        "count": len(fabrics)
    }
```

**Fabric Object Structure**:
```json
{
    "id": "denim-blue",
    "name": "Blue Denim",
    "diffuseUrl": "/static/textures/denim_blue_diffuse.jpg",
    "normalUrl": "/static/textures/denim_blue_normal.jpg",
    "roughnessUrl": "/static/textures/denim_blue_roughness.jpg",
    "thumbnail": "/static/textures/denim_blue_thumb.jpg",
    "roughness": 0.8,
    "metalness": 0.0
}
```

### 4. REST API - Fabric Scanning

**Purpose**: Upload fabric photo and get PBR textures

**Endpoint**: `POST http://localhost:5000/api/fabric/scan`

**Frontend Code** (`frontend/js/fabric-selector.js`):
```javascript
// User selects photo
const file = event.target.files[0];
const base64 = await Utils.blobToBase64(file);

const response = await fetch(
    `${CONFIG.API.BASE_URL}/api/fabric/scan`,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 })
    }
);

const data = await response.json();
// data contains diffuseUrl, normalUrl, roughnessUrl (all base64)

// Create fabric object and add to catalog
const newFabric = {
    id: data.fabric_id,
    name: 'Custom Fabric',
    diffuseUrl: data.diffuseUrl,
    normalUrl: data.normalUrl,
    roughnessUrl: data.roughnessUrl,
    ...
};
```

**Backend Code** (`main.py`):
```python
@app.post("/api/fabric/scan")
async def scan_fabric(request: FabricScanRequest):
    # Decode image
    image = Image.open(io.BytesIO(base64.b64decode(...)))
    
    # Process fabric (see fabric/processor.py)
    result = await fabric_processor.process_fabric(image, fabric_id)
    
    # Returns base64 encoded textures
    return {
        "success": True,
        "fabric_id": fabric_id,
        "diffuseUrl": "data:image/jpeg;base64,...",
        "normalUrl": "data:image/jpeg;base64,...",
        "roughnessUrl": "data:image/jpeg;base64,...",
        "roughness": 0.75,
        "metalness": 0.0
    }
```

**Processing Steps**:
1. Perspective correction
2. Lighting normalization
3. Crop to square
4. Make tileable
5. Generate normal map
6. Generate roughness map
7. Return all textures as base64

## Data Formats

### Image Encoding

**Camera Frames** (WebSocket keyframes):
- Format: JPEG
- Quality: 75%
- Size: ~50KB per frame
- Encoding: `data:image/jpeg;base64,/9j/4AAQSkZJRg...`

**Jacket Renders** (3D → PNG):
- Format: PNG
- Has alpha channel
- Size: ~100KB per frame
- Encoding: `data:image/png;base64,iVBORw0KGgo...`

**Results** (AI output):
- Format: PNG (premium) or JPEG (keyframes)
- Quality: 90% (premium), 80% (keyframes)
- Size: 200-500KB
- Encoding: Base64 with data URI

### Pose Data Format

Frontend sends MediaPipe landmarks to backend:

```javascript
{
    landmarks: [
        { x: 0.5, y: 0.3, z: -0.1, visibility: 0.95 },
        { x: 0.48, y: 0.32, z: -0.12, visibility: 0.93 },
        // ... 33 landmarks total
    ],
    shoulderWidth: 0.25,  // Normalized distance
    rotation: 2.5         // Degrees
}
```

Backend parses and uses for:
- Body orientation
- Scale adjustment
- Pose guidance for AI model

## Configuration Matching

### Frontend Config (`frontend/js/config.js`)

```javascript
const CONFIG = {
    API: {
        BASE_URL: 'http://localhost:5000',
        WS_URL: 'ws://localhost:5000/ws',
        ENDPOINTS: {
            FABRIC_CATALOG: '/api/fabric/catalog',
            FABRIC_SCAN: '/api/fabric/scan',
            VIRTUAL_TRYON: '/virtual-tryon',
            HEALTH: '/health'
        }
    },
    AI_PIPELINE: {
        ENABLED: true,
        KEYFRAME_INTERVAL: 1500,  // ms
        MAX_BLEND_ALPHA: 0.7,
        JPEG_QUALITY: 0.75
    }
};
```

### Backend Config (`backend/.env`)

```env
HOST=0.0.0.0
PORT=5000

FAST_INFERENCE_STEPS=4
QUALITY_INFERENCE_STEPS=25

CORS_ORIGINS=http://localhost:8080,http://localhost:3000
```

**Important**: Update `CORS_ORIGINS` to match your frontend URL!

## Error Handling

### Frontend Error Detection

```javascript
// WebSocket errors
this.ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    Utils.updateStatus('ai', false);
    // Fall back to 3D-only mode
};

// REST API errors
try {
    const response = await fetch(...);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Request failed');
    }
} catch (error) {
    Utils.showError(error.message);
}
```

### Backend Error Responses

```python
# Validation error
raise HTTPException(
    status_code=400,
    detail="Invalid image format"
)

# Processing error
raise HTTPException(
    status_code=500,
    detail=f"Processing failed: {str(e)}"
)

# WebSocket error
await websocket.send_json({
    "type": "error",
    "error": str(e),
    "timestamp": message['timestamp']
})
```

## Performance Optimization

### Frontend Optimizations

1. **Compress before send**:
   - JPEG quality 75% for keyframes
   - Resize to max 1280x720

2. **Throttle keyframes**:
   - Send every 1.5 seconds (not every frame)

3. **Blend smoothly**:
   - Use exponential easing
   - Cap AI blend at 70%
   - Keep 3D responsive

### Backend Optimizations

1. **GPU acceleration**:
   - Use CUDA
   - Enable FP16
   - Enable xformers

2. **Model optimization**:
   - torch.compile()
   - Attention slicing
   - Gradient checkpointing

3. **Caching** (future):
   - Cache fabric textures
   - Cache model outputs
   - Redis for session data

## Testing the Connection

### 1. Start Backend
```bash
cd backend
python main.py
```

Should see:
```
Backend ready! Listening for connections...
INFO:     Uvicorn running on http://0.0.0.0:5000
```

### 2. Test Health Check
```bash
curl http://localhost:5000/health
```

Should return:
```json
{
    "status": "healthy",
    "ai_model_loaded": true,
    ...
}
```

### 3. Start Frontend
```bash
cd frontend
python -m http.server 8080
```

Visit: http://localhost:8080

### 4. Check Browser Console
Should see:
```
Initializing fabric selector...
✓ Fabric selector initialized
Connecting to AI server...
Connected to AI server
Starting AI keyframe pipeline...
```

### 5. Verify Network Traffic
Open browser DevTools → Network tab:
- WebSocket connection to `ws://localhost:5000/ws`
- GET request to `/api/fabric/catalog`
- Periodic WebSocket frames (every 1.5s)

## Common Integration Issues

### Issue 1: CORS Error
**Symptom**: Browser console shows CORS error

**Solution**: Add frontend URL to backend `.env`:
```env
CORS_ORIGINS=http://localhost:8080
```

### Issue 2: WebSocket Won't Connect
**Symptom**: "WebSocket connection failed"

**Solutions**:
- Check backend is running
- Verify URL (ws:// not wss:// for local)
- Check firewall/antivirus
- Try different port

### Issue 3: Images Not Loading
**Symptom**: Fabric textures don't appear

**Solutions**:
- Check catalog.json paths
- Verify texture files exist
- Check CORS for static files
- Use base64 embedded in catalog

### Issue 4: AI Not Working
**Symptom**: Getting fallback 3D-only mode

**Solutions**:
- Check GPU: `nvidia-smi`
- Check logs for model loading errors
- Verify CUDA/PyTorch installation
- Set `DEVICE=cpu` for testing

## Deployment Checklist

When deploying to production:

### Frontend Updates
- [ ] Update `API.BASE_URL` to production URL
- [ ] Change to `wss://` (secure WebSocket)
- [ ] Update CORS configuration
- [ ] Enable HTTPS

### Backend Updates
- [ ] Set `DEBUG=False`
- [ ] Configure `CORS_ORIGINS` with production URL
- [ ] Use environment variables for secrets
- [ ] Enable logging to file
- [ ] Set up monitoring

### Infrastructure
- [ ] SSL certificates installed
- [ ] Firewall rules configured
- [ ] Load balancer (if scaling)
- [ ] Health check endpoint monitored
- [ ] Auto-restart on failure

## Summary

The frontend and backend communicate via:

1. **WebSocket** (`/ws`): Real-time keyframe streaming
2. **REST API** (`/virtual-tryon`): Premium captures
3. **REST API** (`/api/fabric/*`): Fabric management

Key data exchanged:
- Camera frames (JPEG base64)
- 3D renders (PNG base64)
- Pose landmarks (JSON)
- AI results (base64)
- Fabric textures (base64 or URLs)

The backend is fully compatible with your frontend and ready to use!
