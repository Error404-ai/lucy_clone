# Lucy Virtual Try-On - Quick Start Guide

Get your Lucy Virtual Try-On backend up and running in 5 minutes!

## Prerequisites

- Python 3.10 or higher
- 16GB RAM minimum
- NVIDIA GPU with 8GB+ VRAM (optional but recommended)
- CUDA 12.1+ (if using GPU)

## Installation

### 1. Navigate to Backend Directory
```bash
cd backend
```

### 2. Create Virtual Environment
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

This will install:
- FastAPI (web framework)
- PyTorch (AI models)
- Diffusers (image generation)
- OpenCV (image processing)
- And other dependencies

**Note:** This may take 5-10 minutes depending on your internet speed.

### 4. Configure Environment
```bash
cp .env.example .env
```

For quick testing, you can use the default settings. For production, edit `.env`:
```bash
nano .env  # or use any text editor
```

Key settings:
- `DEVICE=cuda` (use GPU) or `DEVICE=cpu` (use CPU)
- `DEBUG=True` (development) or `DEBUG=False` (production)

## Running the Backend

### Start the Server
```bash
python main.py
```

You should see:
```
============================================================
Starting Lucy Virtual Try-On Backend
============================================================
Using device: cuda
GPU: NVIDIA GeForce RTX 3080

Loading AI model...
✓ AI model loaded successfully

Initializing fabric processor...
✓ Fabric processor ready

============================================================
Backend ready! Listening for connections...
============================================================

INFO:     Uvicorn running on http://0.0.0.0:5000
```

### Verify It's Working
Open another terminal and run the test script:
```bash
python test_backend.py
```

Or open your browser and visit:
```
http://localhost:5000/health
```

You should see a JSON response with server status.

## Testing the API

### 1. Health Check
```bash
curl http://localhost:5000/health
```

### 2. Get Fabric Catalog
```bash
curl http://localhost:5000/api/fabric/catalog
```

### 3. Access API Documentation
Open in browser:
- Swagger UI: http://localhost:5000/docs
- ReDoc: http://localhost:5000/redoc

## Connecting to Frontend

Update your frontend configuration (`frontend/js/config.js`):
```javascript
API: {
    BASE_URL: 'http://localhost:5000',
    WS_URL: 'ws://localhost:5000/ws',
    // ... rest of config
}
```

Then start your frontend:
```bash
cd ../frontend
# Use a simple HTTP server
python -m http.server 8080
# Or use Node.js
npx http-server -p 8080
```

Visit: http://localhost:8080

## Common Issues

### GPU Not Detected
If you have an NVIDIA GPU but it's not being used:
1. Check CUDA installation: `nvidia-smi`
2. Verify PyTorch CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
3. Set `DEVICE=cpu` in `.env` as fallback

### Port Already in Use
If port 5000 is busy:
1. Change port in `.env`: `PORT=5001`
2. Update frontend config to match

### Dependencies Installation Failed
If pip install fails:
1. Make sure you have Python 3.10+: `python --version`
2. Update pip: `pip install --upgrade pip`
3. Try installing packages individually

### Out of Memory
If you get CUDA out of memory errors:
1. Lower inference steps in `.env`
2. Enable attention slicing
3. Use CPU instead: `DEVICE=cpu`

## Next Steps

1. **Read the full documentation**: See `README.md` for detailed info
2. **Configure for production**: See `DEPLOYMENT.md` for deployment guides
3. **Customize fabrics**: Add your own textures to `data/catalog/`
4. **Fine-tune the AI model**: Train on your specific jacket model

## Directory Structure

```
backend/
├── main.py              # Main application entry point
├── requirements.txt     # Python dependencies
├── .env                # Configuration (create from .env.example)
│
├── models/             # AI model implementations
│   └── vton_model.py
│
├── fabric/             # Fabric processing
│   └── processor.py
│
├── utils/              # Utility functions
│   ├── image_utils.py
│   └── pose_utils.py
│
└── data/               # Data storage
    ├── fabrics/        # Processed fabric textures
    ├── catalog/        # Fabric catalog (catalog.json)
    └── results/        # Generated try-on images
```

## API Endpoints

- `GET /health` - Server health check
- `GET /api/fabric/catalog` - Get fabric catalog
- `POST /api/fabric/scan` - Upload and process fabric photo
- `POST /virtual-tryon` - Generate premium try-on photo
- `WS /ws` - WebSocket for real-time keyframes

## Getting Help

- Check `README.md` for detailed documentation
- Check `DEPLOYMENT.md` for production deployment
- Run tests: `python test_backend.py`
- Enable debug logging: Set `LOG_LEVEL=DEBUG` in `.env`

## Stopping the Server

Press `Ctrl+C` in the terminal running the server.

---

🎉 **Congratulations!** You now have the Lucy Virtual Try-On backend running!
