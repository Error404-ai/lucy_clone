# Lucy Virtual Try-On - Deployment Guide

This guide will help you deploy the Lucy Virtual Try-On backend on various platforms.

## Table of Contents
1. [Local Development](#local-development)
2. [AWS EC2 Deployment](#aws-ec2-deployment)
3. [Docker Deployment](#docker-deployment)
4. [Production Checklist](#production-checklist)

---

## Local Development

### Prerequisites
- Python 3.10+
- CUDA 12.1+ (optional, for GPU)
- 16GB RAM (minimum)
- 8GB GPU VRAM (recommended)

### Setup Steps

1. **Clone and Navigate**
```bash
cd backend
```

2. **Create Virtual Environment**
```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

3. **Install Dependencies**
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

4. **Configure Environment**
```bash
cp .env.example .env
nano .env  # Edit configuration
```

Key settings for development:
```env
DEBUG=True
DEVICE=cuda  # or cpu
LOG_LEVEL=DEBUG
```

5. **Run the Server**
```bash
python main.py
```

Access at: `http://localhost:5000`

---

## AWS EC2 Deployment

### Instance Selection

**Recommended: g5.xlarge or g5.2xlarge**
- GPU: 1x NVIDIA A10G (24GB VRAM)
- vCPUs: 4-8
- RAM: 16-32GB
- Cost: ~$1.00-$2.00/hour

**Budget Option: g4dn.xlarge**
- GPU: 1x NVIDIA T4 (16GB VRAM)
- vCPUs: 4
- RAM: 16GB
- Cost: ~$0.50/hour

### Step-by-Step Deployment

#### 1. Launch EC2 Instance

```bash
# Use AWS CLI to launch instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \  # Deep Learning AMI
  --instance-type g5.xlarge \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxxx \
  --subnet-id subnet-xxxxxx
```

Security Group Rules:
- Port 22 (SSH) - Your IP only
- Port 5000 (API) - Your frontend origin
- Port 443 (HTTPS) - 0.0.0.0/0 (if using SSL)

#### 2. Connect to Instance

```bash
ssh -i your-key.pem ubuntu@ec2-xx-xx-xx-xx.compute.amazonaws.com
```

#### 3. Install System Dependencies

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Python and dependencies
sudo apt-get install -y \
  python3.10 \
  python3-pip \
  python3-venv \
  git \
  nvidia-utils-525

# Verify CUDA
nvidia-smi
```

#### 4. Clone and Setup

```bash
# Clone repository
git clone <your-repo-url>
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### 5. Configure for Production

```bash
cp .env.example .env
nano .env
```

Production settings:
```env
DEBUG=False
DEVICE=cuda
LOG_LEVEL=INFO
HOST=0.0.0.0
PORT=5000
CORS_ORIGINS=https://yourdomain.com
```

#### 6. Run with systemd

Create service file:
```bash
sudo nano /etc/systemd/system/lucy-backend.service
```

```ini
[Unit]
Description=Lucy Virtual Try-On Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/backend
Environment="PATH=/home/ubuntu/backend/venv/bin"
ExecStart=/home/ubuntu/backend/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable lucy-backend
sudo systemctl start lucy-backend
sudo systemctl status lucy-backend
```

#### 7. Setup Nginx Reverse Proxy (Optional)

```bash
sudo apt-get install nginx

sudo nano /etc/nginx/sites-available/lucy-backend
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/lucy-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 8. SSL with Let's Encrypt (Optional)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

---

## Docker Deployment

### Build and Run Locally

```bash
# Build image
docker build -t lucy-backend:latest .

# Run with GPU
docker run -d \
  --name lucy-backend \
  --gpus all \
  -p 5000:5000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  lucy-backend:latest

# Check logs
docker logs -f lucy-backend
```

### Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Deploy to AWS ECR + ECS

#### 1. Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name lucy-backend \
  --region us-east-1
```

#### 2. Build and Push

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and tag
docker build -t lucy-backend:latest .
docker tag lucy-backend:latest \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/lucy-backend:latest

# Push
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/lucy-backend:latest
```

#### 3. Create ECS Task Definition

```json
{
  "family": "lucy-backend",
  "containerDefinitions": [
    {
      "name": "lucy-backend",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/lucy-backend:latest",
      "memory": 16384,
      "cpu": 4096,
      "essential": true,
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "resourceRequirements": [
        {
          "type": "GPU",
          "value": "1"
        }
      ],
      "environment": [
        {
          "name": "DEVICE",
          "value": "cuda"
        }
      ]
    }
  ],
  "requiresCompatibilities": ["EC2"],
  "networkMode": "bridge"
}
```

---

## Production Checklist

### Security
- [ ] Use HTTPS/WSS instead of HTTP/WS
- [ ] Configure CORS with specific origins (not *)
- [ ] Use environment variables for secrets
- [ ] Enable firewall rules (only allow necessary ports)
- [ ] Keep dependencies updated
- [ ] Use SSL certificates from Let's Encrypt or AWS ACM

### Performance
- [ ] Enable GPU acceleration (CUDA)
- [ ] Enable FP16 for faster inference
- [ ] Enable xformers memory efficient attention
- [ ] Use torch.compile (PyTorch 2.0+)
- [ ] Configure appropriate worker processes
- [ ] Set up CloudFront/CDN for static assets
- [ ] Enable response compression

### Monitoring
- [ ] Set up CloudWatch/Prometheus metrics
- [ ] Configure logging to file/CloudWatch
- [ ] Set up error tracking (Sentry)
- [ ] Monitor GPU utilization
- [ ] Set up uptime monitoring
- [ ] Configure alerts for failures

### Backup
- [ ] Backup data directory regularly
- [ ] Backup catalog.json
- [ ] Version control for model weights
- [ ] S3 backup for user-generated content

### Scaling
- [ ] Use load balancer for multiple instances
- [ ] Implement request queuing for high load
- [ ] Cache frequently used fabrics
- [ ] Consider serverless for fabric processing
- [ ] Use separate storage (S3) for large files

---

## Troubleshooting

### GPU Not Working
```bash
# Check NVIDIA driver
nvidia-smi

# Check CUDA in container
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi

# Verify PyTorch CUDA
python -c "import torch; print(torch.cuda.is_available())"
```

### Out of Memory
- Reduce batch size
- Enable gradient checkpointing
- Use attention slicing
- Lower inference steps

### WebSocket Disconnects
- Check firewall settings
- Increase timeout values
- Use WSS (secure WebSocket) in production
- Check NGINX/ALB WebSocket configuration

### Slow Inference
- Verify GPU is being used
- Enable all optimizations
- Use FP16 precision
- Compile model with torch.compile

---

## Cost Estimation

### AWS EC2 (24/7 operation)

**g5.xlarge:**
- Instance: $1.00/hour × 720 hours = $720/month
- Storage (100GB): ~$10/month
- Data transfer: Variable
- **Total: ~$730/month**

**Cost Optimization:**
- Use Spot Instances: Save up to 70%
- Auto-scaling: Scale down during low usage
- Reserved Instances: Save up to 40% with 1-year commitment

### Docker on Own Infrastructure
- One-time GPU server cost: $2000-$5000
- Electricity: ~$50/month
- Internet: Existing
- **Total: $50/month + upfront cost**

---

## Support

For deployment issues:
1. Check logs: `sudo journalctl -u lucy-backend -f`
2. Review documentation
3. Open GitHub issue
4. Contact support team
