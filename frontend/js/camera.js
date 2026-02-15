// Camera Manager - FIXED to properly display video

class CameraManager {
    constructor() {
        this.video = document.getElementById('camera-video');
        this.stream = null;
        this.isActive = false;
        this.devices = [];
        this.currentDeviceId = null;
        this.isDemoMode = false;
        this.demoCanvas = null;
        this.demoCtx = null;
        this.demoAnimationId = null;
    }

    async init() {
        try {
            console.log('🎥 Initializing camera...');
            
            // ✅ CRITICAL: Make video element accessible but hidden from user view
            this.video.style.display = 'block';
            this.video.style.position = 'fixed';
            this.video.style.top = '0';
            this.video.style.left = '0';
            this.video.style.width = '1px';
            this.video.style.height = '1px';
            this.video.style.opacity = '0';
            this.video.style.zIndex = '-1';
            
            // Check if mediaDevices is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('⚠️ Camera API not supported - entering demo mode');
                return await this.initDemoMode();
            }
            
            // Request camera access
            const constraints = {
                video: {
                    width: { ideal: CONFIG.CAMERA.WIDTH },
                    height: { ideal: CONFIG.CAMERA.HEIGHT },
                    frameRate: { ideal: CONFIG.CAMERA.FRAME_RATE },
                    facingMode: CONFIG.CAMERA.FACING_MODE
                },
                audio: false
            };

            console.log('📸 Requesting camera access...');
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            console.log('✅ Camera access granted');
            this.video.srcObject = this.stream;
            this.video.muted = true;
            this.video.playsInline = true;
            
            // ✅ CRITICAL: Wait for video to be ready and play
            await new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    console.log('📹 Video metadata loaded:', this.video.videoWidth, 'x', this.video.videoHeight);
                    this.video.play()
                        .then(() => {
                            console.log('✅ Video playing');
                            resolve();
                        })
                        .catch(error => {
                            console.error('❌ Video play error:', error);
                            reject(error);
                        });
                };
                
                // Timeout after 10 seconds
                setTimeout(() => reject(new Error('Video load timeout')), 10000);
            });

            // Get available devices
            await this.getDevices();

            this.isActive = true;
            Utils.updateStatus('camera', true);
            console.log('✅ Camera initialized:', this.video.videoWidth, 'x', this.video.videoHeight);
            
            return {
                width: this.video.videoWidth,
                height: this.video.videoHeight
            };
            
        } catch (error) {
            console.error('❌ Camera initialization failed:', error);
            Utils.updateStatus('camera', false);
            
            // Better error messages and fallbacks
            if (error.name === 'NotAllowedError') {
                Utils.showError('Camera permission denied. Please allow camera access and reload.');
                return await this.initDemoMode();
            } else if (error.name === 'NotFoundError') {
                Utils.showError('No camera found. Using demo mode.');
                return await this.initDemoMode();
            } else if (error.name === 'NotReadableError') {
                Utils.showError('Camera is in use by another app. Using demo mode.');
                return await this.initDemoMode();
            } else {
                console.warn('⚠️ Camera error - entering demo mode');
                return await this.initDemoMode();
            }
        }
    }

    async initDemoMode() {
        console.log('🎬 Initializing DEMO MODE (no camera)');
        
        // Create a canvas as fake video feed
        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.CAMERA.WIDTH || 640;
        canvas.height = CONFIG.CAMERA.HEIGHT || 480;
        
        const ctx = canvas.getContext('2d');
        
        // Draw a gradient background with text
        const drawDemoFrame = () => {
            // Gradient background
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, '#1E293B');
            gradient.addColorStop(1, '#0F172A');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Add text
            ctx.fillStyle = '#64748B';
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('DEMO MODE', canvas.width / 2, canvas.height / 2 - 40);
            
            ctx.font = '16px Inter, sans-serif';
            ctx.fillStyle = '#94A3B8';
            ctx.fillText('No camera detected', canvas.width / 2, canvas.height / 2);
            ctx.fillText('Jacket will appear in center', canvas.width / 2, canvas.height / 2 + 30);
            
            // Add a simple silhouette
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 3;
            ctx.beginPath();
            // Head
            ctx.arc(canvas.width / 2, canvas.height / 2 - 80, 30, 0, Math.PI * 2);
            ctx.stroke();
            // Body
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, canvas.height / 2 - 50);
            ctx.lineTo(canvas.width / 2, canvas.height / 2 + 60);
            ctx.stroke();
            // Arms
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, canvas.height / 2 - 30);
            ctx.lineTo(canvas.width / 2 - 60, canvas.height / 2 + 20);
            ctx.moveTo(canvas.width / 2, canvas.height / 2 - 30);
            ctx.lineTo(canvas.width / 2 + 60, canvas.height / 2 + 20);
            ctx.stroke();
        };
        
        try {
            // Draw initial frame
            drawDemoFrame();
            
            // Use captureStream
            this.stream = canvas.captureStream(30);
            this.video.srcObject = this.stream;
            this.video.muted = true;
            this.video.playsInline = true;
            
            this.demoCanvas = canvas;
            this.demoCtx = ctx;
            this.isDemoMode = true;
            
            // Try to play
            const playPromise = this.video.play();
            
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('✅ Demo video playing');
                    })
                    .catch(error => {
                        console.log('⚠️ Autoplay blocked (expected):', error.message);
                    });
            }
            
            // Animate demo mode
            const animate = () => {
                if (this.isDemoMode) {
                    drawDemoFrame();
                    this.demoAnimationId = requestAnimationFrame(animate);
                }
            };
            animate();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            this.isActive = true;
            Utils.updateStatus('camera', true);
            console.log('✅ Demo mode initialized:', canvas.width, 'x', canvas.height);
            
            setTimeout(() => {
                Utils.showError('Running in demo mode - jacket will appear in center');
            }, 500);
            
            return {
                width: canvas.width,
                height: canvas.height
            };
            
        } catch (error) {
            console.error('❌ Demo mode failed:', error);
            this.isActive = true;
            Utils.updateStatus('camera', true);
            return {
                width: canvas.width,
                height: canvas.height
            };
        }
    }

    async getDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.devices = devices.filter(device => device.kind === 'videoinput');
            console.log(`✅ Found ${this.devices.length} camera(s):`);
            this.devices.forEach((device, i) => {
                console.log(`  ${i + 1}. ${device.label || 'Camera ' + (i + 1)}`);
            });
            return this.devices;
        } catch (error) {
            console.error('Error getting devices:', error);
            return [];
        }
    }

    getVideoElement() {
        return this.video;
    }

    getFrame() {
        if (!this.isActive) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth || CONFIG.CAMERA.WIDTH || 640;
        canvas.height = this.video.videoHeight || CONFIG.CAMERA.HEIGHT || 480;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    getFrameCanvas() {
        if (!this.isActive) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth || CONFIG.CAMERA.WIDTH || 640;
        canvas.height = this.video.videoHeight || CONFIG.CAMERA.HEIGHT || 480;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        
        return canvas;
    }

    async captureFrame(format = 'image/jpeg', quality = 0.95) {
        if (!this.isActive) return null;

        const canvas = this.getFrameCanvas();
        return await Utils.canvasToBlob(canvas, format, quality);
    }

    async captureFrameBase64(format = 'image/jpeg', quality = 0.95) {
        const blob = await this.captureFrame(format, quality);
        if (!blob) return null;
        return await Utils.blobToBase64(blob);
    }

    getDimensions() {
        return {
            width: this.video.videoWidth || CONFIG.CAMERA.WIDTH || 640,
            height: this.video.videoHeight || CONFIG.CAMERA.HEIGHT || 480
        };
    }

    isReady() {
        if (this.isDemoMode) return this.isActive;
        return this.isActive && this.video.readyState === this.video.HAVE_ENOUGH_DATA;
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.demoAnimationId) {
            cancelAnimationFrame(this.demoAnimationId);
            this.demoAnimationId = null;
        }
        
        this.isActive = false;
        this.isDemoMode = false;
        Utils.updateStatus('camera', false);
        console.log('Camera stopped');
    }

    pause() {
        if (this.video && !this.isDemoMode) {
            this.video.pause();
        }
    }

    resume() {
        if (this.video && this.isActive && !this.isDemoMode) {
            this.video.play().catch(err => {
                console.warn('Resume failed:', err);
            });
        }
    }
}

const cameraManager = new CameraManager();