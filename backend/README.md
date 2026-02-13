# Lucy Virtual Try-On Backend

Backend API server for the Lucy Virtual Try-On application. Provides real-time AI-powered virtual try-on capabilities using diffusion models.

## Features

- 🎨 **Real-time Virtual Try-On**: WebSocket-based streaming for live AR overlay enhancement
- 📸 **Premium Capture**: High-quality AI-generated try-on photos
- 🧵 **Fabric Processing**: Automatic PBR texture generation from fabric photos
- 📦 **Fabric Catalog**: Manage and serve fabric texture libraries
- ⚡ **GPU Accelerated**: CUDA support for fast inference
- 🐳 **Docker Ready**: Containerized deployment with NVIDIA runtime

## Architecture

```
┌─────────────────┐
│   Frontend      │
│  (Three.js +    │
│   MediaPipe)    │
└────────┬────────┘
         │ WebSocket (keyframes)
         │ REST (capture, fabrics)
         ↓
┌─────────────────┐
│   FastAPI       │
│   Backend       │
├─────────────────┤
│ • Virtual Try-On│
│ • Fabric Proc.  │
│ • WebSocket Hub │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ AI Models       │
│ • IDM-VTON      │
│ • Stable Diff.  │
└─────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.10+
- CUDA 12.1+ (for GPU acceleration)
- 8GB+ GPU VRAM (recommended)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd backend
```

2. **Create virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Set up environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. **Run the server**
```bash
python main.py
```

The server will start on `http://localhost:5000`

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and configuration.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-02-12T10:30:00",
  "ai_model_loaded": true,
  "fabric_processor_ready": true,
  "device": "cuda",
  "active_connections": 3
}
```

### Fabric Catalog
```
GET /api/fabric/catalog
```
Get all available fabrics.

**Response:**
```json
{
  "success": true,
  "fabrics": [
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
  ],
  "count": 3
}
```

### Fabric Scan
```
POST /api/fabric/scan
Content-Type: application/json
```

**Request:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

**Response:**
```json
{
  "success": true,
  "fabric_id": "custom_a1b2c3d4",
  "diffuseUrl": "data:image/jpeg;base64,...",
  "normalUrl": "data:image/jpeg;base64,...",
  "roughnessUrl": "data:image/jpeg;base64,...",
  "roughness": 0.75,
  "metalness": 0.0
}
```

### Virtual Try-On (Premium Capture)
```
POST /virtual-tryon
Content-Type: application/json
```

**Request:**
```json
{
  "user_image": "data:image/jpeg;base64,...",
  "jacket_render": "data:image/png;base64,...",
  "pose": {
    "landmarks": [...],
    "shoulderWidth": 0.25,
    "rotation": 2.5
  },
  "fabric_id": "denim-blue"
}
```

**Response:**
```json
{
  "success": true,
  "result_image": "data:image/png;base64,...",
  "result_id": "result_x1y2z3a4",
  "timestamp": "2024-02-12T10:35:00"
}
```

### WebSocket (Real-time Keyframes)
```
WS /ws
```

**Client → Server:**
```json
{
  "type": "keyframe",
  "timestamp": 1707735000000,
  "camera_frame": "data:image/jpeg;base64,...",
  "jacket_render": "data:image/png;base64,...",
  "pose": {
    "landmarks": [...],
    "shoulderWidth": 0.25,
    "rotation": 2.5
  },
  "fabric_id": "denim-blue"
}
```

**Server → Client:**
```json
{
  "type": "keyframe_result",
  "image": "data:image/jpeg;base64,...",
  "timestamp": 1707735000000,
  "mode": "ai_enhanced"
}
```

## Docker Deployment

### Build Image
```bash
docker build -t lucy-backend:latest .
```

### Run Container (CPU)
```bash
docker run -d \
  -p 5000:5000 \
  -v $(pwd)/data:/app/data \
  --name lucy-backend \
  lucy-backend:latest
```

### Run Container (GPU)
```bash
docker run -d \
  -p 5000:5000 \
  -v $(pwd)/data:/app/data \
  --gpus all \
  --name lucy-backend \
  lucy-backend:latest
```

## Project Structure

```
backend/
├── main.py                 # FastAPI application entry point
├── requirements.txt        # Python dependencies
├── Dockerfile             # Docker configuration
├── .env.example           # Environment variables template
│
├── models/
│   └── vton_model.py      # Virtual try-on AI model wrapper
│
├── fabric/
│   └── processor.py       # Fabric photo to PBR texture processor
│
├── utils/
│   ├── image_utils.py     # Image processing utilities
│   └── pose_utils.py      # Pose landmark processing
│
└── data/
    ├── fabrics/           # Processed fabric textures
    ├── catalog/           # Fabric catalog metadata
    └── results/           # Generated try-on results
```

## Configuration

Key configuration options in `.env`:

- `DEVICE`: Use `cuda` for GPU or `cpu` for CPU inference
- `FAST_INFERENCE_STEPS`: Number of diffusion steps for keyframes (default: 4)
- `QUALITY_INFERENCE_STEPS`: Number of steps for premium capture (default: 25)
- `TEXTURE_SIZE`: Resolution for fabric textures (default: 1024)
- `ENABLE_XFORMERS`: Enable memory-efficient attention (recommended for GPU)

## Performance Tuning

### GPU Optimization
- Use FP16 (half precision) for faster inference: `USE_FP16=True`
- Enable xformers: `ENABLE_XFORMERS=True`
- Enable torch.compile (PyTorch 2.0+): `ENABLE_TORCH_COMPILE=True`

### Inference Speed
- **Fast mode (keyframes)**: 4 steps → ~300-500ms
- **Quality mode (capture)**: 25 steps → ~3-5 seconds

### Memory Usage
- Minimum GPU VRAM: 6GB
- Recommended GPU VRAM: 8GB+
- CPU RAM: 16GB+

## AI Model Setup

### Option 1: Use Pre-trained IDM-VTON

1. Visit [HuggingFace IDM-VTON](https://huggingface.co/yisol/IDM-VTON)
2. Accept the license agreement
3. The model will download automatically on first run

### Option 2: Fine-tune Your Own Model

Follow the training guide in the documentation to create a custom model trained on your synthetic data.

## Troubleshooting

### GPU Not Detected
```bash
# Check CUDA installation
nvidia-smi

# Verify PyTorch CUDA support
python -c "import torch; print(torch.cuda.is_available())"
```

### Out of Memory Errors
- Reduce `FAST_INFERENCE_STEPS` to 2-3
- Enable `ENABLE_ATTENTION_SLICING=True`
- Lower `TEXTURE_SIZE` to 512

### Slow Inference
- Ensure GPU is being used: Check logs for "Using device: cuda"
- Enable all optimizations in `.env`
- Reduce image resolution

## Development

### Running Tests
```bash
pytest tests/
```

### Code Style
```bash
black .
flake8 .
```

### API Documentation
Once the server is running, visit:
- Swagger UI: `http://localhost:5000/docs`
- ReDoc: `http://localhost:5000/redoc`

## License

[Your License Here]

## Support

For issues and questions, please open an issue on GitHub.
